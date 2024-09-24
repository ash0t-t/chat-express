const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const url = require('url');
const { MongoClient } = require('mongodb');
const URL = 'mongodb://localhost:27017';
const client = new MongoClient(URL);
client.connect(err => {
  if (err) {
    console.log(err)
  } else {
    console.log("connected mongodb")
  }
});

const db = client.db('chat-users');
const users = db.collection('users');

const bp = require('body-parser');

const app = express();
app.use(bp.json());
app.use(cors());

const characters =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateString(length) {
  let result = ' ';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

app.post('/api/registration', async (req, res) => {
  const { username, password, bio } = req.body;
  const user = await users.findOne({ username });
  console.log(user);
  const authKey = generateString(6).trim();
  if (user) {
    return res.send('User with that username already exists');
  }
  const newUser = {
    username,
    password,
    bio,
    authKey,
    friends: [],
  };
  await users.insertOne(newUser);
  res.send(newUser);
});

app.patch('/api/update', async (req, res) => {
  const { username, password, bio } = req.body;
  const user = await users.findOne({ username, password });
  if (!user) {
    return res.send('No such user');
  }
  const filter = { username: username };
  const update = {
    $set: {
      bio: bio,
    }
  };
  const result = await users.updateOne(filter, update);
  res.send(result);
});

app.post('/api/auth', async (req, res) => {
  const { username, password } = req.body;
  // console.log(username, password)
  const user = await users.findOne({ username, password });
  if (user) {
    return res.send({ authKey: user.authKey });
  }
  return res.send('No such user');
});

app.post('/api/add-friend', async (req, res) => {
  const { username, friendUsername } = req.body;

  const user = await users.findOne({ username });
  const friend = await users.findOne({ username: friendUsername });

  if (!user || !friend) {
    return res.status(404).send('User or friend not found');
  }

  if (user.friends.includes(friendUsername)) {
    return res.status(400).send('Already friends');
  }

  await users.updateOne({ username }, { $push: { friends: friendUsername } });
  await users.updateOne(
    { username: friendUsername },
    { $push: { friends: username } }
  );

  res.send('Friend added successfully');
});

app.listen(3001, () => {
  console.log("Server running on port 3000");
});

const server = new WebSocket.Server({ port: 4000 });
let clients = {};

server.on('connection', async (client, req) => {
  const { query } = url.parse(req.url, true);
  const { authKey } = query;

  const user = await users.findOne({ authKey });

  if (!user) {
    client.send('Unauthorized');
    client.close();
  } else {
    client.send('Welcome to the chat, ' + user.username + '!');
    const key = user.username.toString();
    clients[key] = client;

    client.on('message', async (message) => {
      const sms = message.toString();
      const recipientUsername = sms.split(",")[0].toString();
      const text = sms.split(",")[1];

      const recipient = await users.findOne({ username: recipientUsername });

      if (!recipient || !user.friends.includes(recipient.username)) {
        client.send('You can only send messages to your friends.');
        return;
      }

      const recipientClient = Object.entries(clients).find(
        (c) => c[0] == recipient.username
      );
      console.log(recipientClient)

      if (recipientClient) {
        recipientClient[1].send(`From ${user.username}: ${text.trim()}`);
      } else {
        client.send('Recipient is not connected.');
      }
    });
  }
});
