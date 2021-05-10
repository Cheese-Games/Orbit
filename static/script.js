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

var movement = {
  up: false,
  down: false,
  left: false,
  right: false
};

$("#ColorPicker").spectrum({
  color: false,
  preferredFormat: "hex",
  showInitial: true,
  showInput: true,
  containerClassName: "colorPicker",
  replacerClassName: "colorPicker",
  change: (color)=>{
    ChangeColor(color.toHexString());
  }
});
$("#openChatBtn").hide();

function Join() {
  var server = $("#ServerInput").val();
  $("#status").html("Connecting...");
  if (socket !== undefined) {
    noModal = true;
    socket.disconnect();
  }
  socket = io(server);
  setUpSockets();
}

function setUpSockets() {
  clearInterval(movementInterval);
  socket.off("state");
  socket.off("modal");
  socket.off("pong");
  socket.off("disconnect");
  socket.off("message");
  canvas.width = 1200;
  canvas.height = 600;
  socket.on("state", function(players) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var bw = 1205;
    var bh = 605;
    var p = -1;

    function drawBoard() {
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
    drawBoard();
    for (var id in players) {
      var player = players[id];
      if (player.color === "rainbow") {
        ctx.strokeStyle = pSBC(-0.4, getRainbow());
        ctx.fillStyle = getRainbow();
      } else {
        ctx.strokeStyle = player.shadowColor;
        ctx.fillStyle = player.color;
      }

      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 22, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fill();
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#99aab5";
      ctx.fillText(player.name, player.x, player.y + 45);
      ctx.fillText("Ping: " + ping, 100, 25);
      if (debug) {
        ctx.textAlign = "left";
        var p = players[socket.id];
        ctx.fillText(`${Math.floor(p.x)}, ${Math.floor(p.y)}  |
${Math.floor(p.vx)}, ${Math.floor(p.vy)}`, 10, 582)
      }
      ctx.closePath();
    }
  });

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
    if (!kick)
      openModal("Connection was interrupted. Try reloading the page");
    $("#canvas").hide();
    $("#openChatBtn").hide();
  });

  socket.on("connect_error", function() {
    $("#canvas").hide();
    $("#openChatBtn").hide();
    $("#status").html("Could not connect to server");
  });

  socket.on("connect", function() {
    $("#status").html("");
    kick = false;
    socket.emit("join", $("#NameInput").val());
    $("#canvas").show();
    $("#openChatBtn").show();
    openNav();
  });

  socket.on("message", function(message) {
    var chat = $("#Chat")[0];
    $("#Message0").clone().appendTo("#Chat").html(message);
    chat.scrollTop = chat.scrollHeight
  });

  movementInterval = setInterval(function() {
    if (movement.down || movement.up || movement.left || movement.right) {
      socket.emit("movement", movement);
    }
  }, 1000 / 60);
}

document.addEventListener("keydown", function(event) {
  if (event.keyCode === 13) {
    if ($("#ComposedMessage").is(':focus')) {
      Send();
    } else if ($("#NameInput").is(':focus') || $("#ServerInput").is(':focus')) {
      $("#NameInput").blur();
      Join();
    }
  } else if (event.keyCode === 115) {
    debug = !debug;
  }

  if (!canMove()) {
    movement.down = false;
    movement.left = false;
    movement.right = false;
    movement.up = false;
    return;
  };
  switch (event.keyCode) {
    case 37: // left
    case 65: // A
      movement.left = true;
      break;

    case 38: // up
    case 87: // W
      movement.up = true;
      break;

    case 39: // right
    case 68: // D
      movement.right = true;
      break;

    case 40: // down
    case 83: // S
      movement.down = true;
      break;
  }
});

document.addEventListener("keyup", function(event) {
  if (!canMove()) return;
  switch (event.keyCode) {
    case 37: // left
    case 65: // A
      movement.left = false;
      break;

    case 38: // up
    case 87: // W
      movement.up = false;
      break;

    case 39: // right
    case 68: // D
      movement.right = false;
      break;

    case 40: // down
    case 83: // S
      movement.down = false;
      break;
  }
});

window.onblur = function(event) {
  movement.left = false;
  movement.up = false;
  movement.right = false;
  movement.down = false;
}

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
  return !($("#ComposedMessage").is(':focus') || $("#NameInput").is(':focus') || $("#ServerInput").is(':focus'));
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
  var red = sin_to_hex(Date.now(), 0 * Math.PI * 2 / 3); // 0   deg
  var blue = sin_to_hex(Date.now(), 1 * Math.PI * 2 / 3); // 120 deg
  var green = sin_to_hex(Date.now(), 2 * Math.PI * 2 / 3); // 240 deg
  var rainbow = "#" + red + green + blue;

  return rainbow;
}

function sin_to_hex(i, phase) {
  var sin = Math.sin(Math.PI / 9999 * 2 * i + phase);
  var int = Math.floor(sin * 127) + 128;
  var hex = int.toString(16);

  return hex.length === 1 ? "0" + hex : hex;
}

const pSBC = (r, t, e, l) => {
  var n, g, i, a, s, b, p, u = parseInt,
    h = Math.round,
    o = "string" == typeof e;
  return "number" != typeof r || r < -1 || r > 1 || "string" != typeof t || "r" != t[0] && "#" != t[0] || e && !o ? null : (this.pSBCr || (this.pSBCr = (r => {
    var t = r.length,
      e = {};
    if (t > 9) {
      if ([n, g, i, o] = r = r.split(","), (t = r.length) < 3 || t > 4) return null;
      e.r = u("a" == n[3] ? n.slice(5) : n.slice(4)), e.g = u(g), e.b = u(i), e.a = o ? parseFloat(o) : -1
    } else {
      if (8 == t || 6 == t || t < 4) return null;
      t < 6 && (r = "#" + r[1] + r[1] + r[2] + r[2] + r[3] + r[3] + (t > 4 ? r[4] + r[4] : "")), r = u(r.slice(1), 16), 9 == t || 5 == t ? (e.r = r >> 24 & 255, e.g = r >> 16 & 255, e.b = r >> 8 & 255, e.a = h((255 & r) / .255) / 1e3) : (e.r = r >> 16, e.g = r >> 8 & 255, e.b = 255 & r, e.a = -1)
    }
    return e
  })), p = t.length > 9, p = o ? e.length > 9 || "c" == e && !p : p, s = this.pSBCr(t), a = r < 0, b = e && "c" != e ? this.pSBCr(e) : a ? {
    r: 0,
    g: 0,
    b: 0,
    a: -1
  } : {
    r: 255,
    g: 255,
    b: 255,
    a: -1
  }, a = 1 - (r = a ? -1 * r : r), s && b ? (l ? (n = h(a * s.r + r * b.r), g = h(a * s.g + r * b.g), i = h(a * s.b + r * b.b)) : (n = h((a * s.r ** 2 + r * b.r ** 2) ** .5), g = h((a * s.g ** 2 + r * b.g ** 2) ** .5), i = h((a * s.b ** 2 + r * b.b ** 2) ** .5)), o = s.a, b = b.a, o = (s = o >= 0 || b >= 0) ? o < 0 ? b : b < 0 ? o : o * a + b * r : 0, p ? "rgb" + (s ? "a(" : "(") + n + "," + g + "," + i + (s ? "," + h(1e3 * o) / 1e3 : "") + ")" : "#" + (4294967296 + 16777216 * n + 65536 * g + 256 * i + (s ? h(255 * o) : 0)).toString(16).slice(1, s ? void 0 : -2)) : null)
};
