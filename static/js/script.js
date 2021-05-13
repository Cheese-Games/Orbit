const defaultServer = "https://a-game-by-xtracube.herokuapp.com/";
var socket;
var canvas = $("#canvas")[0];
var ctx = canvas.getContext("2d");
var messageInput = $("#ComposedMessage")[0];
var chatVisible = false;
var ping = 0;
var kick = false;
var noModal = false;
var debug = false;
var movementInterval;
var movementPing;
var playerInterpolation = true;
var reusePositions = true;

var intervals = [];

var serverInfo = {
  tickRate: 20,
  version: "Unknown"
};
serverInfo.tickInterval = 1000 / serverInfo.tickRate;

var clientInfo = {
  tickRate: 100,
  version: "0.1b",
  frameTimeMultiplier: 0.2
};
clientInfo.tickInterval = 1000 / clientInfo.tickRate;

var movement = {
  directions: {
    up: false,
    down: false,
    left: false,
    right: false,
  },
  sum: function() {
    var sum = 0;
    for (direction in this.directions)
      if (this.directions[direction]) sum++;
    return sum;
  },
  reset: function() {
    for (direction in this.directions) this.directions[direction] = false;
    this.changed = true;
  },
  changed: false
};

$("#ColorPicker").spectrum({
  color: false,
  preferredFormat: "hex",
  showInitial: true,
  showInput: true,
  containerClassName: "colorPicker",
  replacerClassName: "colorPicker",
  change: (color) => {
    ChangeColor(color.toHexString());
  },
  hide: (color) => {
    ChangeColor(color.toHexString());
  },
});
$("#openChatBtn").hide();

function onEmojiClick() {
  $("#emoji-picker").toggle();
}

document.querySelector("emoji-picker").addEventListener("emoji-click", (event) => $("#ComposedMessage").val($("#ComposedMessage").val() + event.detail["unicode"]));

function Join() {
  if (socket !== undefined && socket.connected) {
    socket.emit("join", $("#NameInput").val());
    return;
  }
  var server = $("#ServerInput").val();
  $("#status").html("Connecting...");
  socket = io(server);
  setUpSockets();
}

function setUpSockets() {
  clearInterval(movementInterval);
  clearInterval(movementPing);
  clearInterval(gameTick);
  socket.off("state");
  socket.off("modal");
  socket.off("pong");
  socket.off("disconnect");
  socket.off("message");
  canvas.width = 1200;
  canvas.height = 600;

  socket.on("state", function(updatedPlayers) {
    // Reuse positions to prevent jitter for laggy connections, to test this: Manually set the clientInfo frameTimeMultiplier to something lower than it should be
    if (playerInterpolation && reusePositions)
      for (var id in oldPlayers) {
        if (oldPlayers[id].cx && players[id]) {
          players[id].x = oldPlayers[id].cx;
          players[id].y = oldPlayers[id].cy;
        }
      }
    frame = 1;
    oldPlayers = players;
    players = updatedPlayers;
  });

  gameTick = setInterval(gameTick, clientInfo.tickInterval);

  socket.on("pong", function(ms) {
    ping = ms;
  });

  socket.on("modal", function(message, closeStuff) {
    kick = true;
    openModal(message);
    if (!closeStuff) return;
    $("#canvas").hide();
    $("#openChatBtn").hide();
  });

  socket.on("disconnect", function() {
    if (!kick) openModal("Connection was interrupted. Try reloading the page");
    $("#canvas").hide();
    $("#openChatBtn").hide();
  });

  socket.on("connect_error", function() {
    $("#canvas").hide();
    $("#openChatBtn").hide();
    $("#status").html("Could not connect to server");
  });

  socket.on("connect", function() {
    $("#ServerInput").hide();
    $('label[for="ServerInput"]').hide();
    $("#ConnectButton").val("Change Name");
    $("#status").html("");
    kick = false;
    socket.emit("join", $("#NameInput").val());
    $("#canvas").show();
    $("#openChatBtn").show();
    openNav();
  });

  socket.on("server_info", function(data) {
    serverInfo.tickRate = data.tickRate;
    serverInfo.tickInterval = data.tickInterval;
    serverInfo.version = data.version;
    clientInfo.frameTimeMultiplier = clientInfo.tickInterval / serverInfo.tickInterval;
  });

  socket.on("message", function(message) {
    var chat = $("#Chat")[0];
    $("#Message0").clone().appendTo("#Chat").html(message);
    chat.scrollTop = chat.scrollHeight;
  });

  movementInterval = setInterval(function() {
    if (movement.changed) {
      movement.changed = false;
      socket.emit("movement", movement.directions);
    }
  }, 1000 / 60);

  // Just incase a packet is dropped at some stage, send our movement every 250ms
  movementPing = setInterval(function() {
    socket.emit("movement", movement.directions);
  }, 250);
}

document.addEventListener("keydown", function(event) {
  if (event.keyCode === 13) {
    if ($("#ComposedMessage").is(":focus")) {
      Send();
    } else if ($("#NameInput").is(":focus") || $("#ServerInput").is(":focus")) {
      $("#NameInput").blur();
      Join();
    }
  } else if (event.keyCode === 115) {
    debug = !debug;
  }

  if (!canMove()) {
    movement.reset();
    return;
  }
  var before = movement.sum();
  switch (event.keyCode) {
    case 37: // left
    case 65: // A
      movement.directions.left = true;
      break;

    case 38: // up
    case 87: // W
      movement.directions.up = true;
      break;

    case 39: // right
    case 68: // D
      movement.directions.right = true;
      break;

    case 40: // down
    case 83: // S
      movement.directions.down = true;
      break;
  }

  if (!movement.changed) movement.changed = movement.sum() != before;
});

document.addEventListener("keyup", function(event) {
  if (!canMove()) {
    movement.reset();
    return;
  }
  var before = movement.sum();
  switch (event.keyCode) {
    case 37: // left
    case 65: // A
      movement.directions.left = false;
      break;

    case 38: // up
    case 87: // W
      movement.directions.up = false;
      break;

    case 39: // right
    case 68: // D
      movement.directions.right = false;
      break;

    case 40: // down
    case 83: // S
      movement.directions.down = false;
      break;
  }

  if (!movement.changed) movement.changed = movement.sum() != before;
});

oldPlayers = [];
players = [];

function drawBoard(bw, bh, p) {
  ctx.lineWidth = 1;
  for (var x = 40; x <= bw - 40; x += 40) {
    ctx.moveTo(x + p, p);
    ctx.lineTo(x + p, bh + p);
  }
  for (var x = 40; x <= bh - 40; x += 40) {
    ctx.moveTo(p, x + p);
    ctx.lineTo(bw + p, x + p);
  }
  ctx.strokeStyle = "#444";
  ctx.stroke();
}

function lerp(start, end, time) {
  return start * (1 - time) + end * time;
}

var frame = 1;
function gameTick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var bw = 1205;
    var bh = 605;
    var p = -1;

    drawBoard(bw, bh, p);
    for (var id in players) {
        var player = players[id];
        var px, py;
        if (playerInterpolation && (oldPlayer = oldPlayers[id])) {
            var frameTime = frame * clientInfo.frameTimeMultiplier; // (originally was 0.2) 0.2 = (gameTick in ms / serverTickRate in ms), server ticks every 50ms in this version and game ticks every 10ms so (10/50) = 20 so 0.2
            //note: I made this up originally, 0.2 was a guess and I worked backwards to figure out why it works so well -Koupah
            px = lerp(oldPlayer.x, player.x, frameTime);
            py = lerp(oldPlayer.y, player.y, frameTime);
            oldPlayer.cx = px;
            oldPlayer.cy = py;
        } else {
            px = player.x;
            py = player.y;
        }

        if (player.color === "rainbow") {
            ctx.fillStyle = getRainbow();
            ctx.strokeStyle = pSBC(-0.4, ctx.fillStyle); // Rearranged so we don't have to call getRainbow() twice
        } else {
            ctx.strokeStyle = player.shadowColor;
            ctx.fillStyle = player.color;
        }

        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(px, py, 22, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fill();
        ctx.font = "18px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#99aab5";
        ctx.fillText(player.name, px, py + 45);
        ctx.fillText("Ping: " + ping, 100, 25);
        if (debug) {
            ctx.textAlign = "left";
            var p = players[socket.id];
            ctx.fillText(
                `${Math.floor(p.x)}, ${Math.floor(p.y)}`,
                10,
                582
            );
        }
        ctx.closePath();
    }
    frame++;
}

window.onblur = function(event) {
  movement.directions.left = false;
  movement.directions.up = false;
  movement.directions.right = false;
  movement.directions.down = false;
  movement.changed = true;
};

function ToggleChat() {
  if (chatVisible) {
    closeNav();
  } else {
    openNav();
  }
  chatVisible = !chatVisible;
}

function openNav() {
  $("#chatBar").css("width", "25vw");
  $("#openChatBtn").html("&#9776; Close Chat");
}

function closeNav() {
  $("#chatBar").css("width", "0");
  $("#openChatBtn").html("&#9776; Open Chat");
}

function Send() {
  if (socket === undefined) return;
  socket.emit("send", messageInput.value);
  messageInput.value = "";
}

function ChangeColor(color) {
  if (socket === undefined) return;
  socket.emit("color", color);
}

function canMove() {
  return !($("#ComposedMessage").is(":focus") || $("#NameInput").is(":focus") || $("#ServerInput").is(":focus"));
}

function openModal(text) {
  if (noModal) {
    noModal = false;
    return;
  }
  $("#modalText").html(text);
  $("#inactivityModal").css("display", "block");
}

function closeModal() {
  $("#inactivityModal").css("display", "none");
  location.reload();
}

function getRainbow() {
  var red = sin_to_hex(Date.now(), (0 * Math.PI * 2) / 3); // 0   deg
  var blue = sin_to_hex(Date.now(), (1 * Math.PI * 2) / 3); // 120 deg
  var green = sin_to_hex(Date.now(), (2 * Math.PI * 2) / 3); // 240 deg
  var rainbow = "#" + red + green + blue;

  return rainbow;
}

function sin_to_hex(i, phase) {
  var sin = Math.sin((Math.PI / 9999) * 2 * i + phase);
  var int = Math.floor(sin * 127) + 128;
  var hex = int.toString(16);

  return hex.length === 1 ? "0" + hex : hex;
}

const pSBC = (r, t, e, l) => {
  var n,
    g,
    i,
    a,
    s,
    b,
    p,
    u = parseInt,
    h = Math.round,
    o = "string" == typeof e;
  return "number" != typeof r || r < -1 || r > 1 || "string" != typeof t || ("r" != t[0] && "#" != t[0]) || (e && !o) ?
    null :
    (this.pSBCr ||
      (this.pSBCr = (r) => {
        var t = r.length,
          e = {};
        if (t > 9) {
          if ((([n, g, i, o] = r = r.split(",")), (t = r.length) < 3 || t > 4)) return null;
          (e.r = u("a" == n[3] ? n.slice(5) : n.slice(4))), (e.g = u(g)), (e.b = u(i)), (e.a = o ? parseFloat(o) : -1);
        } else {
          if (8 == t || 6 == t || t < 4) return null;
          t < 6 && (r = "#" + r[1] + r[1] + r[2] + r[2] + r[3] + r[3] + (t > 4 ? r[4] + r[4] : "")),
            (r = u(r.slice(1), 16)),
            9 == t || 5 == t ? ((e.r = (r >> 24) & 255), (e.g = (r >> 16) & 255), (e.b = (r >> 8) & 255), (e.a = h((255 & r) / 0.255) / 1e3)) : ((e.r = r >> 16), (e.g = (r >> 8) & 255), (e.b = 255 & r), (e.a = -1));
        }
        return e;
      }),
      (p = t.length > 9),
      (p = o ? e.length > 9 || ("c" == e && !p) : p),
      (s = this.pSBCr(t)),
      (a = r < 0),
      (b =
        e && "c" != e ?
        this.pSBCr(e) :
        a ?
        {
          r: 0,
          g: 0,
          b: 0,
          a: -1,
        } :
        {
          r: 255,
          g: 255,
          b: 255,
          a: -1,
        }),
      (a = 1 - (r = a ? -1 * r : r)),
      s && b ?
      (l ? ((n = h(a * s.r + r * b.r)), (g = h(a * s.g + r * b.g)), (i = h(a * s.b + r * b.b))) : ((n = h((a * s.r ** 2 + r * b.r ** 2) ** 0.5)), (g = h((a * s.g ** 2 + r * b.g ** 2) ** 0.5)), (i = h((a * s.b ** 2 + r * b.b ** 2) ** 0.5))),
        (o = s.a),
        (b = b.a),
        (o = (s = o >= 0 || b >= 0) ? (o < 0 ? b : b < 0 ? o : o * a + b * r) : 0),
        p ? "rgb" + (s ? "a(" : "(") + n + "," + g + "," + i + (s ? "," + h(1e3 * o) / 1e3 : "") + ")" : "#" + (4294967296 + 16777216 * n + 65536 * g + 256 * i + (s ? h(255 * o) : 0)).toString(16).slice(1, s ? void 0 : -2)) :
      null);
};
