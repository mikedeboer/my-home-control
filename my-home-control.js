#!/usr/bin/env node

const HarmonyHub = require("./lib/harmonyHub");
const TurnTouchRemote = require("./lib/turnTouchRemote");
const Noble = require("noble");

var gHarmonyHubs = new HarmonyHub();
var gRemote;
Noble.on("stateChange", function(state) {
  if (state == "poweredOn") {
    gRemote = new TurnTouchRemote(Noble, gHarmonyHubs);
  } else {
    process.exit();
  }
});

function shutdown(err) {
  Noble.stopScanning();
  try {
    gHarmonyHubs.disconnect();
  } catch (ex) {
    console.error("Error whilst disconnecting from hubs:", ex);
  }
  gRemote.disconnect();
  if (err) {
    console.error("Uncaught Exception:", err);
  }
}

process.on("exit", shutdown);
// process.on("uncaughtException", shutdown);
