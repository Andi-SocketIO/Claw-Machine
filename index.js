var http = require("http");
const { createClient } = require("redis");
const { Server } = require("socket.io");
const express = require("express");
const cors = require("cors");
const { log } = require("console");
const port = 11100;

require("dotenv").config();

const app = express();
app.use(cors());

var httpServer = http.createServer(app);

var HTTP = httpServer;
var PORT = port;

const io = new Server(HTTP, {
   cors: {
      credentials: true,
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE"],
   },
});

const pubClient = createClient({
   host: "127.0.0.1",
   port: PORT,
});

const subClient = pubClient.duplicate();

// io.adapter(createAdapter(pubClient, subClient));

io.on("connection", connection);

HTTP.listen(PORT, () => {
   console.log("HTTP Server running on port " + PORT);
});

var controllerBaseURL = "https://controller.com";

var users = {};
var games = {};

function connection(socket) {
   //console.log("Socket: " + socket.id);
   users[socket.id] = "";

   //from game machine
   socket.on("createGame", () => {
      let newRoomCode = generateRandomString(7, true);
      while (newRoomCode in games) {
         newRoomCode = generateRandomString(7, true);
      }

      //console.log("Room Created: " + newRoomCode);

      socket.join(newRoomCode);
      io.to(newRoomCode).emit(
         "createGame",
         controllerBaseURL + "?roomCode=" + newRoomCode
      );

      games[newRoomCode] = {
         machineId: socket.id,
         controllerId: "",
         isStarted: false,
      };

      if (socket.id in users) {
         users[socket.id] = newRoomCode;
      }
   });

   //from machine
   socket.on("senditem", (data) => {
      var deserializibleData = data.split(":");

      var roomCode = deserializibleData[0];
      var flag = deserializibleData[1];

      if (!(roomCode in games)) return;

      io.to(roomCode).emit("getitem", flag);
   });

   //from machine
   socket.on("endgame", (data) => {
      var deserializibleData = data.split(":");

      var roomCode = deserializibleData[0];
      var flag = deserializibleData[1];

      if (!(roomCode in games)) return;

      io.to(roomCode).emit("gamestate", "gameplay_ends");
   });

   //from controller
   socket.on("joinGame", (room) => {
      let isRoomAvailable = room in games;

      if (!isRoomAvailable) {
         io.to(socket.id).emit("joinGame", "failed");
         return;
      }

      socket.join(room);
      io.to(room).emit("joinGame", "success");

      games[room].controllerId = socket.id;

      if (socket.id in users) {
         users[socket.id] = room;
      }
   });

   //from controller
   socket.on("gameStart", (room) => {
      let isRoomAvailable = room in games;
      if (!isRoomAvailable) {
         io.to(room).emit("gamestate", "failed");
         return;
      }

      io.to(room).emit("gamestate", "gameplay_starts");
      games[room].isStarted = true;
   });

   //from controller
   socket.on("controller", (data) => {
      let roomCode = data.roomCode;
      let inputKey = data.inputKey;
      let valueKey = data.valueKey;

      if (roomCode == null) return;
      if (inputKey == null) return;
      if (valueKey == null) return;

      io.to(roomCode).emit("controller", inputKey + ":" + valueKey);
   });

   socket.on("disconnect", () => {
      const disconnectedId = socket.id;

      let isPlayerAvailable = disconnectedId in users;
      if (!isPlayerAvailable) {
         delete users[disconnectedId];
         return;
      }

      var userRoomId = users[disconnectedId];
      if (userRoomId != "") {
         if (!(userRoomId in games)) return;
         delete games[userRoomId];
         delete users[disconnectedId];
         io.to(userRoomId).emit("gamestate", "gameplay_interupted");
      } else {
      }
   });
}

function generateRandomString(length, isUpperCase) {
   let result = "";
   const charCodeStart = isUpperCase ? 65 : 97;
   const charCodeEnd = isUpperCase ? 90 : 122;

   for (let i = 0; i < length; i++) {
      const randomCharCode =
         Math.floor(Math.random() * (charCodeEnd - charCodeStart + 1)) +
         charCodeStart;
      result += String.fromCharCode(randomCharCode);
   }

   return result;
}
