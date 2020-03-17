const TurnTouch = require("turntouch");

const HUB_NAME = "Huiskamer";
const ACT_WATCHTV = "TV kijken";
const ACT_RADIO = "Radio luisteren";

module.exports = class TurnTouchRemote {
  constructor(poweredNoble, harmonyRemote) {
    this.instance = new TurnTouch(poweredNoble);
    this._events = new Map([
      ["button", button => this.onButtonMessage(button)],
      ["battery", batteryLevel => this.onBatteryMessage(batteryLevel)],
      ["error", err => console.error("TurnTouchRemote Error: ", err)]
    ]);
    for (let [eventName, handler] of this._events) {
      this.instance.on(eventName, handler);
    }

    this.harmonyRemote = harmonyRemote;
  }

  destructor() {
    this.disconnect();
    for (let [eventName, handler] of this._events) {
      this.instance.off(eventName, handler);
    }
    this.harmonyRemote.removeAllListeners("hub");
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
    let hub = await this.getHub(HUB_NAME);
    const isCurrentActivity = (...labels) =>
      !!hub.currentActivity && labels.indexOf(hub.currentActivity.label) != -1;
    const isOff = this.harmonyRemote.isOff(hub);

    // console.log("GOTS HUB!!", hub);
    switch (event.button) {
      case "north":
        if (event.hold && isOff) {
          await this.switchHubActivity(hub, ACT_WATCHTV);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          // Act as channel control.
          console.log("Already in activity, channel UP.");
          await this.sendHubCommand(hub, "pvr", "channelUp");
        }
        break;
      case "east":
        if (event.hold && isOff) {
          await this.switchHubActivity(hub, ACT_RADIO);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, volume UP.");
          await this.sendHubCommand(hub, "receiver", "volumeUp");
        }
        break;
      case "south":
        if (event.hold && !isOff) {
          console.log("Turning current activity OFF.");
          await this.switchHubOff(hub);
        } else if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, channel DOWN.");
          await this.sendHubCommand(hub, "pvr", "channelDown");
        }
        break;
      case "west":
        if (isCurrentActivity(ACT_WATCHTV, ACT_RADIO)) {
          console.log("Already in activity, volume DOWN."); 
          await this.sendHubCommand(hub, "receiver", "volumeDown");
        }
        break;
      case "multi-touch":
        break;
    }
  }

  onBatteryMessage(batteryLevel) {
    console.log("BATTERY LEVEL", batteryLevel + "%");
  }

  async sendHubCommand(hub, ...args) {
    if (this._sendingHubCommand) {
      return;
    }
    this._sendingHubCommand = true;
    await this.harmonyRemote.sendCommand(hub, ...args);
    this._sendingHubCommand = false;
  }

  async switchHubActivity(hub, activity) {
    if (this._switchingHubActivity) {
      return;
    }
    if (this.harmonyRemote.matchesCurrentActivity(hub, activity)) {
      console.log("Switching off current activity.", hub.currentActivity);
      await this.switchHubOff(hub);
    }
    this._switchingHubActivity = true;
    console.log("Starting '" + activity + "' activity.");
    await this.harmonyRemote.startActivity(hub, activity);
    this._switchingHubActivity = false;
  }

  async switchHubOff(hub) {
    if (this._switchingHubActivity) {
      return;
    }
    this._switchingHubActivity = true;
    await this.harmonyRemote.startActivity(hub, "off");
    this._switchingHubActivity = false;
  }
};
