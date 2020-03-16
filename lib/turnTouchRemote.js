const TurnTouch = require("turntouch");

const HUB_NAME = "Huiskamer";
const ACT_WATCHTV = "TV kijken";
const ACT_RADIO = "Radio luisteren";

module.exports = class TurnTouchRemote {
  constructor(poweredNoble, harmonyRemote) {
    this.instance = new TurnTouch(poweredNoble);
    this.instance.on("button", button => this.onButtonMessage(button));
    this.instance.on("battery", batteryLevel => this.onBatteryMessage(batteryLevel));
    this.instance.on("error", err => console.error("TurnTouchRemote Error: ", err));

    this.harmonyRemote = harmonyRemote;
  }

  disconnect() {
    this.instance.disconnect();
  }

  async getHub(name) {
    let hub = this.harmonyRemote.getHub(name);
    if (hub) {
      return hub;
    }

    return new Promise(resolve => {
      let onHub;
      this.harmonyRemote.on("hub", onHub = () => {
        if (hub = this.harmonyRemote.getHub(name)) {
          this.harmonyRemote.off(onHub);
          resolve(hub);
        }
      });
    });
  }

  async onButtonMessage(event) {
    console.log("BUTTON EVENT", event);
    let hub = await this.getHub(HUB_NAME);
    const isCurrentActivity = (...labels) =>
      !!hub.currentActivity && labels.indexOf(hub.currentActivity.label) != -1;

    // console.log("GOTS HUB!!", hub);
    switch (event.button) {
      case "north":
        if (event.hold && !hub.currentActivity) {
          await this.switchHubActivity(hub, ACT_WATCHTV);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          // Act as channel control.
          console.log("Already in activity, channel UP.");
          await this.harmonyRemote.sendCommand(hub, "pvr", "channelUp");
        }
        break;
      case "east":
        if (event.hold && !hub.currentActivity) {
          await this.switchHubActivity(hub, ACT_RADIO);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, volume UP.");
          await this.harmonyRemote.sendCommand(hub, "receiver", "volumeUp");
        }
        break;
      case "south":
        if (event.hold && !this.harmonyRemote.isOff(hub)) {
          console.log("Turning current activity OFF.");
          await this.switchHubOff(hub);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, channel DOWN.");
          await this.harmonyRemote.sendCommand(hub, "pvr", "channelDown");
        }
        break;
      case "west":
        if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, volume DOWN."); 
          await this.harmonyRemote.sendCommand(hub, "receiver", "volumeDown");
        }
        break;
      case "multi-touch":
        break;
    }
  }

  onBatteryMessage(batteryLevel) {
    console.log("BATTERY LEVEL", batteryLevel + "%");
  }

  async switchHubActivity(hub, activity) {
    if (this.harmonyRemote.matchesCurrentActivity(hub, activity)) {
      console.log("Switching off current activity.", hub.currentActivity);
      await this.switchHubOff(hub);
    }
    console.log("Starting '" + activity + "' activity.");
    await this.harmonyRemote.startActivity(hub, activity);
  }

  async switchHubOff(hub) {
    await this.harmonyRemote.startActivity(hub, "off");
  }
};
