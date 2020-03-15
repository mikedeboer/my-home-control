const TurnTouch = require("turntouch");

const HUB_NAME = "Huiskamer";
const ACT_WATCHTV = "TV kijken";

module.exports = class TurnTouchRemote {
  constructor(poweredNoble, harmonyRemote) {
    this.instance = new TurnTouch(poweredNoble);
    this.instance.on("button", button => this.onButtonMessage(button));
    this.instance.on("battery", batteryLevel => this.onBatteryMessage(batteryLevel));
    this.instance.on("error", err => console.error(err));

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
    const isCurrentActivity = label =>
      !!hub.currentActivity && hub.currentActivity.label == label;

    // console.log("GOTS HUB!!", hub);
    switch (event.button) {
      case "north":
        if (event.hold) {
          // Start 'TV' activity.
          await this.harmonyRemote.startActivity(hub, ACT_WATCHTV);
        } else if (isCurrentActivity(ACT_WATCHTV)) {
          // Act as channel control.
          await this.harmonyRemote.sendCommand(hub, "pvr", "channelUp");
        }
        break;
      case "east":
        if (isCurrentActivity(ACT_WATCHTV)) {
          await this.harmonyRemote.sendCommand(hub, "receiver", "volumeUp");
        }
        break;
      case "south":
        if (event.hold) {
          // Turn activity off.
          await this.harmonyRemote.startActivity(hub, "off");
        } else if (isCurrentActivity(ACT_WATCHTV)) {
          await this.harmonyRemote.sendCommand(hub, "pvr", "channelUp");
        }
        break;
      case "west":
        if (isCurrentActivity(ACT_WATCHTV)) {
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
};
