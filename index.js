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
const io = socketIO(server, {
    pingInterval: 1000,
});
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const port = process.env.PORT || 3000;

const velMod = 1;
const velDownRate = 0.87;

// timer in minutes
const inactivityTimer = 10;

var sockets = io.sockets.sockets;

app.set("port", port);
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});
app.use("/static", express.static(__dirname + "/static"));
app.get("/", function (request, response) {
    response.sendFile(path.join(__dirname, "/index.html"));
});

String.prototype.isEmpty = function () {
    return this.length === 0 || !this.trim() || !this || /^\s*$/.test(this);
};

String.prototype.sanitize = function () {
    return DOMPurify.sanitize(this);
};

String.prototype.purify = function () {
    return profanity.purify(this.toString()).slice(0, -1).toString();
};

server.listen(port, function () {
    console.log(`Starting server on port ${port}`);
});

var players = {};
var colliders = {};

function kickPlayer(socket, message) {
    var socketId = socket.id;
    socket.emit("modal", message, true);
    socket.disconnect(true);
    socket = undefined;
    delete players[p];
    delete colliders[p];
}

function randomInt(min = 0, max = 10000) {
    return Math.floor(Math.random() * (max - min)) + min;
}

io.on("connection", function (socket) {
    socket.on("join", function (name = "Player") {
        name = name.toString().sanitize().slice(0, 16).purify();

        if (name.isEmpty() || name.toString().isEmpty()) name = "Player";

        // Loop to ensure name w/ numbers on it doesn't already exist
        var modified = false;
        nameWhile: while (true) {
            // Check if name already exists
            for (socketId in players) {
                if (socketId === socket.id) continue;
                if (players[socketId].name == name) {
                    name = (!modified ? name + " (" + randomInt(10, 99) : name.slice(0, -1) /* Remove ')' */ + randomInt(1, 9)) + ")";
                    modified = true;
                    continue nameWhile;
                }
            }
            break;
        }

        if ((existingPlayer = players[socket.id]) !== undefined) {
            existingPlayer.rateLimit.nameChanges++;
            if (existingPlayer.rateLimit.nameChanges > 20) {
                kickPlayer(socket, "You have been kicked. Reason: Name Spam");
                return;
            }
            existingPlayer.name = name;
            return;
        }

        // Can't be generic about state change, if they change color 5 times then join this will kick them smh
        // if (stateChange > 5) {
        //     kickPlayer(socket, "You have been kicked. Reason: Too many state changes");
        //     return;
        // }

        var color = "#" + Math.floor(Math.random() * 16777215).toString(16);
        var shadowColor = pSBC(-0.4, color);

        x = randomInt(50, 1000);
        y = randomInt(50, 500);

        players[socket.id] = {
            x: x,
            y: y,
            name: name,
            vx: 0,
            vy: 0,
            color: color,
            shadowColor: shadowColor,
            timeSinceLastState: 0,
            lastMovement: 0,
            afk: false,
            rateLimit: {
                colorChanges: 0,
                nameChanges: 0,
                messagesSent: 0,
                reset: function () {
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

        collider = {
            type: "circle",
            x: x,
            y: y,
            r: 26,
        };
        colliders[socket.id] = collider;
    });

    socket.on("movement", function (data) {
        var player = players[socket.id];
        if (!data || !player) return;
        player.timeSinceLastState = 0;
        player.lastMovement = 0;
        player.movement.directions = data;
    });

    socket.on("disconnect", function () {
        delete players[socket.id];
        delete colliders[socket.id];
    });

    socket.on("send", function (msg) {
        if (msg.isEmpty()) return;
        try {
            message = msg.toString().sanitize().purify().slice(0, 99);
            var player = players[socket.id];
            player.rateLimit.messagesSent++;

            if (player.rateLimit.messagesSent > 4) {
                kickPlayer(socket, "You have been kicked. Reason: Spam");
                return;
            }
            player.timeSinceLastState = 0;
            io.sockets.emit("message", `${player.name}: ${message}`);
        } catch {}
    });

    socket.on("color", function (color) {
        // Ensure the player is setting an existing color
        if (
            color === undefined ||
            !(typeof color == "string") ||
            !((color.startsWith("#") && color.length == 7 && color.split("#").length - 1 == 1) || color == "rainbow")
        )
            return;

        try {
            var player = players[socket.id];
            player.color = color;
            player.shadowColor = pSBC(-0.4, color);
            player.rateLimit.colorChanges++;
            if (player.rateLimit.colorChanges > 60) {
                kickPlayer(socket, "You have been kicked. Reason: Color Spam");
                return;
            }
            player.timeSinceLastState = 0;
        } catch {}
    });

    socket.on("data", function () {
        var data = {};
        data["playerCount"] = getPlayerCount();
        socket.emit("responseData", data);
    });
});

setInterval(function () {
    for (var socketId in sockets) {
        var player = players[socketId];
        var playerCollider = colliders[socketId];
        if (player === undefined) continue;

        if (player.movement.directions.left) player.vx -= velMod;

        if (player.movement.directions.up) player.vy -= velMod;

        if (player.movement.directions.right) player.vx += velMod;

        if (player.movement.directions.down) player.vy += velMod;

        player.vx *= velDownRate;
        player.vy *= velDownRate;
        player.x += player.vx;
        player.y += player.vy;
        if (player.x > 1170) {
            player.x = 1170;
        } else if (player.x < 30) {
            player.x = 30;
        }
        if (player.y > 570) {
            player.y = 570;
        } else if (player.y < 30) {
            player.y = 30;
        }

        playerCollider.x = player.x;
        playerCollider.y = player.y;

        for (var collid in colliders) {
            if (collid === socketId) continue;
            var collider = colliders[collid];
            switch (collider.type) {
                case "circle":
                    if (CirclesColliding(playerCollider, collider)) {
                        var vCollision = {
                            x: collider.x - playerCollider.x,
                            y: collider.y - playerCollider.y,
                        };
                        var distance = Math.sqrt(
                            (collider.x - playerCollider.x) * (collider.x - playerCollider.x) +
                                (collider.y - playerCollider.y) * (collider.y - playerCollider.y)
                        );
                        var vCollisionNorm = {
                            x: vCollision.x / distance,
                            y: vCollision.y / distance,
                        };
                        var impulse = 2 / 40;
                        players[collid].vx += impulse * 10 * vCollisionNorm.x;
                        players[collid].vy += impulse * 10 * vCollisionNorm.y;
                        player.vx -= impulse * 30 * vCollisionNorm.x;
                        player.vy -= impulse * 30 * vCollisionNorm.y;
                    }
                    break;
            }
        }
    }
    io.sockets.emit("state", players);
}, 15);

setInterval(function () {
    for (var p in players) {
        players[p].rateLimit.reset();
    }
}, 1000);

setInterval(function () {
    for (var socketId in sockets) {
        var player = players[socketId];
        var socket = sockets[socketId];
        if (player === undefined) continue;
        player.timeSinceLastState += 1000;
        if (player.timeSinceLastState > inactivityTimer * 60000 && !player.afk) {
            kickPlayer(socket, "You have been kicked for inactivity");
            continue;
        }
    }
}, 1000);

function getPlayerCount() {
    return players.length;
}

function CirclesColliding(c1, c2) {
    var dx = c2.x - c1.x;
    var dy = c2.y - c1.y;
    var rSum = c1.r + c2.r;
    return dx * dx + dy * dy <= rSum * rSum;
}

function RectsColliding(r1, r2) {
    return !(r1.x > r2.x + r2.w || r1.x + r1.w < r2.x || r1.y > r2.y + r2.h || r1.y + r1.h < r2.y);
}

function RectCircleColliding(rect, circle) {
    var dx = Math.abs(circle.x - (rect.x + rect.w / 2));
    var dy = Math.abs(circle.y - (rect.y + rect.y / 2));

    if (dx > circle.r + rect.w2) {
        return false;
    }
    if (dy > circle.r + rect.h2) {
        return false;
    }

    if (dx <= rect.w) {
        return true;
    }
    if (dy <= rect.h) {
        return true;
    }

    var dx = dx - rect.w;
    var dy = dy - rect.h;
    return dx * dx + dy * dy <= circle.r * circle.r;
}

const pSBC = (p, c0, c1, l) => {
    var r,
        g,
        b,
        P,
        f,
        t,
        h,
        i = parseInt,
        m = Math.round,
        a = typeof c1 == "string";
    if (typeof p != "number" || p < -1 || p > 1 || typeof c0 != "string" || (c0[0] != "r" && c0[0] != "#") || (c1 && !a)) return null;
    if (!this.pSBCr)
        this.pSBCr = (d) => {
            var n = d.length,
                x = {};
            if (n > 9) {
                ([r, g, b, a] = d = d.split(",")), (n = d.length);
                if (n < 3 || n > 4) return null;
                (x.r = i(r[3] == "a" ? r.slice(5) : r.slice(4))), (x.g = i(g)), (x.b = i(b)), (x.a = a ? parseFloat(a) : -1);
            } else {
                if (n == 8 || n == 6 || n < 4) return null;
                if (n < 6) d = "#" + d[1] + d[1] + d[2] + d[2] + d[3] + d[3] + (n > 4 ? d[4] + d[4] : "");
                d = i(d.slice(1), 16);
                if (n == 9 || n == 5) (x.r = (d >> 24) & 255), (x.g = (d >> 16) & 255), (x.b = (d >> 8) & 255), (x.a = m((d & 255) / 0.255) / 1000);
                else (x.r = d >> 16), (x.g = (d >> 8) & 255), (x.b = d & 255), (x.a = -1);
            }
            return x;
        };
    (h = c0.length > 9),
        (h = a ? (c1.length > 9 ? true : c1 == "c" ? !h : false) : h),
        (f = this.pSBCr(c0)),
        (P = p < 0),
        (t = c1 && c1 != "c" ? this.pSBCr(c1) : P ? { r: 0, g: 0, b: 0, a: -1 } : { r: 255, g: 255, b: 255, a: -1 }),
        (p = P ? p * -1 : p),
        (P = 1 - p);
    if (!f || !t) return null;
    if (l) (r = m(P * f.r + p * t.r)), (g = m(P * f.g + p * t.g)), (b = m(P * f.b + p * t.b));
    else (r = m((P * f.r ** 2 + p * t.r ** 2) ** 0.5)), (g = m((P * f.g ** 2 + p * t.g ** 2) ** 0.5)), (b = m((P * f.b ** 2 + p * t.b ** 2) ** 0.5));
    (a = f.a), (t = t.a), (f = a >= 0 || t >= 0), (a = f ? (a < 0 ? t : t < 0 ? a : a * P + t * p) : 0);
    if (h) return "rgb" + (f ? "a(" : "(") + r + "," + g + "," + b + (f ? "," + m(a * 1000) / 1000 : "") + ")";
    else return "#" + (4294967296 + r * 16777216 + g * 65536 + b * 256 + (f ? m(a * 255) : 0)).toString(16).slice(1, f ? undefined : -2);
};
