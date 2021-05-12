const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");
const profanity = require("profanity-util");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");
const { purify } = require("profanity-util");
const app = express();
const server = http.Server(app);
const io = socketIO(server, { pingInterval: 500 });
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);
const Matter = require("matter-js");
const Engine = Matter.Engine,
  Render = Matter.Render,
  Runner = Matter.Runner,
  Bodies = Matter.Bodies,
  Bounds = Matter.Bounds,
  Body = Matter.Body,
  Composite = Matter.Composite;

// setting up physics engine and added walls
const engine = Engine.create({ gravity: { scale: 0 } });
const speedMod = 0.1;
const leftWall = Bodies.rectangle(0, 300, 1, 600, { isStatic: true }),
  rightWall = Bodies.rectangle(1200, 300, 1, 600, { isStatic: true }),
  topWall = Bodies.rectangle(600, 0, 1200, 1, { isStatic: true }),
  bottomWall = Bodies.rectangle(600, 600, 1200, 1, { isStatic: true });

Composite.add(engine.world, [leftWall, rightWall, topWall, bottomWall]);

// process.env.PORT is used for Heroku compat
const port = process.env.PORT || 3000;

// inactivity timer in minutes
const inactivityTimer = 10;

const tickRate = 20;
const serverInfo = {
  version: "0.1.0",
  tickRate: tickRate, // True tickRate, maths is calculated same time now!~~Not true tickRate, just the rate we send info to users~~
  tickInterval: 1000 / tickRate
};

var sockets = io.sockets.sockets;
var players = {};
var bodies = {};

// To remove official client support, comment out the origins line
// To allow modded client support, add the modded client url in like this:
// io.set("origins", "https://orbit-cg.herokuapp.com:* https://custom-client.address:* ");
// You can allow all clients by simply putting " *:* "
//io.set("origins", "https://orbit-cg.herokuapp.com:*");

app.set("port", port);
app.use("/static", express.static(__dirname + "/static"));
app.get("/", function(request, response) {
  response.sendFile(path.join(__dirname, "/index.html"));
});

String.prototype.isEmpty = function() {
  return this.length === 0 || !this.trim() || !this || /^\s*$/.test(this);
};

String.prototype.sanitize = function() {
  return DOMPurify.sanitize(this, {
    ALLOWED_TAGS: ["b", "i"],
    ALLOWED_ATTR: ['lmao']
  });
};

String.prototype.purify = function() {
  return profanity.purify(this.toString()).slice(0, -1).toString();
};

server.listen(port, function() {
  console.log(`Starting server on port ${port}`);
});

function kickPlayer(socket, message) {
  var socketId = socket.id;
  socket.emit("modal", message, true);
  socket.disconnect(true);
  socket = undefined;
  delete players[socketId];
  try {
    Composite.remove(engine.world, bodies[socketId]);
  } catch (error) { console.log(error); }
  delete bodies[socketId];
}

function randomInt(min = 0, max = 10000) {
  return Math.floor(Math.random() * (max - min)) + min;
}

io.on("connection", function(socket) {
  socket.on("join", function(name = "Player") {
    name = name.toString().sanitize().slice(0, 16).purify();

    if (name.isEmpty() || name.toString().isEmpty()) name = "Player";

    // Loop to ensure name w/ numbers on it doesn"t already exist
    var modified = false;
    nameWhile: while (true) {
      // Check if name already exists
      for (var socketId in players) {
        if (socketId === socket.id) continue;
        if (players[socketId].name == name) {
          name = (!modified ? name + " (" + randomInt(10, 99) : name.slice(0, -1) /* Remove ")" */ + randomInt(1, 9)) + ")";
          modified = true;
          continue nameWhile;
        }
      }
      break;
    }

    socket.emit("server_info", serverInfo);

    if ((existingPlayer = players[socket.id]) !== undefined) {
      existingPlayer.rateLimit.nameChanges++;
      if (existingPlayer.rateLimit.nameChanges > 20) {
        kickPlayer(socket, "You have been kicked. Reason: Name Spam");
        return;
      }
      existingPlayer.name = name;
      return;
    }

    var color = "#000000".replace(/0/g, function() {
      return (~~(Math.random() * 16)).toString(16);
    });

    x = randomInt(50, 1000);
    y = randomInt(50, 500);

    players[socket.id] = {
      name: name,
      color: color,
      timeSinceLastState: 0,
      lastMovement: 0,
      afk: false,
      rateLimit: {
        colorChanges: 0,
        nameChanges: 0,
        messagesSent: 0,
        reset: function() {
          this.colorChanges = 0;
          this.nameChanges = 0;
          this.messagesSent = 0;
        },
      },
      movement: {
        directions: {
          up: false,
          down: false,
          left: false,
          right: false,
        },
      },
    };

    bodies[socket.id] = Matter.Bodies.circle(x, y, 26, {
      frictionAir: 0.2,
      mass: 60,
      inverseMass: 1 / 60
    });
    Composite.add(engine.world, bodies[socket.id]);
  });

  socket.on("movement", function(data) {
    var player = players[socket.id];
    if (!data || !player) return;
    player.timeSinceLastState = 0;
    player.lastMovement = 0;
    player.movement.directions = data;
  });

  socket.on("disconnect", function() {
    delete players[socket.id];
    try {
      Composite.remove(engine.world, bodies[socket.id]);
    } catch (error) { console.log(error); }
    delete bodies[socket.id];
  });

  socket.on("send", function(message) {
    if (message === undefined) return;
    message = message.toString().sanitize().purify().slice(0, 99);
    if (message.isEmpty()) return;
    var player = players[socket.id];
    player.rateLimit.messagesSent++;

    if (player.rateLimit.messagesSent > 4) {
      kickPlayer(socket, "You have been kicked. Reason: Spam");
      return;
    }
    player.timeSinceLastState = 0;

    message = message
      .replace(/\*\*(.*)\*\*/gim, "<b>$1</b>")
      .replace(/\*(.*)\*/gim, "<i>$1</i>")
      .replace(/\n$/gim, "<br />");
    if (message.isEmpty()) return;

    io.sockets.emit("message", `${player.name}: ${message}`);
  });

  socket.on("color", function(color) {
    // Ensure the player is setting an existing color
    if (color === undefined || !(typeof color == "string") || !(/^#([0-9A-F]{3}){1,2}$/i.test(color) || color == "rainbow")) return;

    var player = players[socket.id];
    player.color = color;
    player.rateLimit.colorChanges++;
    if (player.rateLimit.colorChanges > 60) {
      kickPlayer(socket, "You have been kicked. Reason: Color Spam");
      return;
    }
    player.timeSinceLastState = 0;
  });

  socket.on("data", function() {
    var data = {};
    data.playerCount = getPlayerCount();
    socket.emit("responseData", data);
  });
});

setInterval(function() {
  var toSend = {};
  for (var id in players) {
    player = players[id];
    body = bodies[id];
    if (player.movement.directions.right) {
      Body.applyForce(body, body.position, {
        x: speedMod,
        y: 0
      });
    }
    if (player.movement.directions.left) {
      Body.applyForce(body, body.position, {
        x: -speedMod,
        y: 0
      });
    }
    if (player.movement.directions.up) {
      Body.applyForce(body, body.position, {
        x: 0,
        y: -speedMod
      });
    }
    if (player.movement.directions.down) {
      Body.applyForce(body, body.position, {
        x: 0,
        y: speedMod
      });
    }
  }
  Engine.update(engine, serverInfo.tickInterval);
  for (var id in players) {
    var body = bodies[id];
    var player = players[id];
    toSend[id] = {
      name: player.name,
      x: body.position.x,
      y: body.position.y,
      color: player.color
    }
  }
  io.sockets.emit("state", toSend);
}, serverInfo.tickInterval);

setInterval(function() {
  for (var socketId in sockets) {
    var player = players[socketId];
    var socket = sockets[socketId];
    if (player === undefined) continue;
    player.timeSinceLastState += 1000;
    if (player.timeSinceLastState > inactivityTimer * 60000 && !player.afk) {
      kickPlayer(socket, "You have been kicked for inactivity");
      continue;
    }
    player.rateLimit.reset();
  }
}, 1000);

function getPlayerCount() {
  return players.length;
}
