'use strict'

// CUSTOMIZE THESE VARIABLES
const DB_NAME = "example5343234"
const DB_NAME_CONTROL = "control1234775"
const IPFS = require('ipfs')
const OrbitDB = require('orbit-db')

const PUBSUB_CHANNEL = 'ipfs-test-chat-app2'
let onlineNodes = {};
let chatRequestNodes = [];
let dbInstances = [];
let onlines = 0
// starting ipfs node
console.log("Starting...")
const ipfs = new IPFS({
  repo: './orbitdb/examples/ipfs',
  start: true,
  EXPERIMENTAL: {
    pubsub: true,
  },
  config: {
    Addresses: {
      Swarm: [
        '/ip4/0.0.0.0/tcp/4004',
        '/ip4/190.204.66.182/tcp/4004/ws'
      ],
      API: '/ip4/190.204.66.182/tcp/5004',
      Gateway: '/ip4/190.204.66.182/tcp/9094',
      Delegates: []
    },
  },
  relay: {
    enabled: true, // enable circuit relay dialer and listener
    hop: {
      enabled: true // enable circuit relay HOP (make this node a relay)
    }
  },
  // pubsub: true
})

ipfs.on('error', (err) => console.error(err))

ipfs.on("replicated", () => {
  console.log(`replication event fired`);
})

ipfs.on('ready', async () => {
  // init orbitDb
  let db
  try {
    const access = {
      // Give write access to everyone
      write: ["*"]
    };

    const orbitdb = new OrbitDB(ipfs, './orbitdb/examples/eventlog')
    db = await orbitdb.eventlog(DB_NAME, access)//orbitdb.eventlog(DB_NAME, access)
    await db.load()
    console.log(`db id: ${db.id}`)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
  let dbControl
  try {
    const access = {
      // Give write access to everyone
      write: ["*"]
    };

    const orbitdb = new OrbitDB(ipfs, './orbitdb/examples/eventlog')
    dbControl = await orbitdb.eventlog(DB_NAME_CONTROL, access)//orbitdb.eventlog(DB_NAME, access)
    await dbControl.load()
    console.log(`dbControl id: ${db.id}`)
  } catch (e) {
    console.error(e)
    process.exit(1)
  }


  //subscribe to master  pubsub channel
  ipfs.pubsub.subscribe(PUBSUB_CHANNEL, (data) => {
    const jsonData = JSON.parse(data.data.toString())
    const key = data.from.toString()
    if (jsonData.status === 'online') {
      const userData = {
        username: jsonData.username ? jsonData.username : "",
        date: new Date(),
        keyId: key
      }
      if (onlineNodes[data.from] == undefined) {
        console.log('system', `${data.from} joined the chat`)
      }
      onlineNodes[data.from] = userData
      // console.log(onlineNodes[data.from]);
    }
    if (jsonData.status === 'message') {
      query(jsonData.username, jsonData.message);
    }
    if (jsonData.status === 'requestChat') {
      console.log("requestChat")
      subscribe(jsonData.channelName,jsonData.dbName)
      queryControl(jsonData.peer1, jsonData.peer2, jsonData.channelName, jsonData.dbName, jsonData.dbId)
    }



  })


  // sending online nodes in master channel
  setInterval(() => {
    const msg = { onlineNodes: onlineNodes }
    const msgEncoded = Buffer.from(JSON.stringify(msg))
    ipfs.pubsub.publish(PUBSUB_CHANNEL, msgEncoded)
  }, 1000)

  // pull offline nodes from list
  setInterval(() => {
    const peers = Object.keys(onlineNodes)
    peers.sort().forEach((peerID, i) => {
      onlines = i + 1
      const timeLastSaw = onlineNodes[peerID].date
      const diff = (new Date() - timeLastSaw) / 1000
      if (diff > 5) {
        delete onlineNodes[peerID]
        console.log(`System ${peerID} left the chat`)
        return
      }
    })
    // console.log(`Online nodes : ${onlines} `)
  }, 1000)

  const subscribe = async (cnahhelName,dbname) => {
    ipfs.pubsub.subscribe(cnahhelName, (data) => {
      // here system mssg send
      console.log(data.from);
    })
  }

  // db query for add data
  const query = async (nickname, message) => {
    try {
      const entry = { nickname: nickname, message: message }
      //encrypt entry here
      await db.add(entry)

    } catch (e) {
      console.error(e)
      process.exit(1)
    }
  }
  const queryControl = async (from, to, channelName, dbName, dbID) => {

    let chatData
    const latestMessages = dbControl.iterator({ limit: -1 }).collect();
    for (let i = 0; i < latestMessages.length; i++) {
      //desencryt  latestMessages[i]
      if (latestMessages[i].payload.value.peer1 === from) {
        if (latestMessages[i].payload.value.peer2 === to) {
          chatData = latestMessages[i].payload.value
        }
      } else if (latestMessages[i].payload.value.peer1 === to) {
        if (latestMessages[i].payload.value.peer2 === from) {
          chatData = latestMessages[i].payload.value
        }
      }
    }
    // for channel betwwen 2 peer exists
    if (chatData) {
      const entry2 = { peer1: from, peer2: to, channelName: chatData.channelName, dbName: chatData.dbName, dbId: dbID, exist: true }
      const msgEncoded = Buffer.from(JSON.stringify(entry2))
      ipfs.pubsub.publish(from, msgEncoded);
      return chatData
    }
    // for  channel betwwen 2 peer not exists
    try {

      const entry = { peer1: from, peer2: to, channelName: channelName, dbName: dbName, dbId: dbID, exist: false }
       //encrypt entry here
      await dbControl.add(entry)
      const msgEncoded = Buffer.from(JSON.stringify(entry))
      ipfs.pubsub.publish(from, msgEncoded);
    } catch (e) {
      console.error(e)
      process.exit(1)
    }


  }
})
