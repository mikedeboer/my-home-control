#!/usr/bin/env node

const HarmonyHub = require("./lib/harmonyHub");
const TurnTouchRemote = require("./lib/turnTouchRemote");
const Noble = require("noble");

var gHarmonyHubs = new HarmonyHub();
var gRemote;
Noble.once("stateChange", function(state) {
  if (state == "poweredOn") {
    gRemote = new TurnTouchRemote(Noble, gHarmonyHubs);
  } else {
    process.exit();
  }
});

function shutdown(err) {
  Noble.stopScanning();
  try {
    gHarmonyHubs.destructor();
  } catch (ex) {
    console.error("Error whilst disconnecting from hubs:", ex);
  }
  gRemote.destructor();
  if (err) {
    console.error("Uncaught Exception:", err);
  }
}

process.on("exit", shutdown);
// process.on("uncaughtException", shutdown);
