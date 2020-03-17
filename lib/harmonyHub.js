const Events = require("events");
const HarmonyHubClient = require("harmony-websocket");
const HarmonyHubDiscover = require("harmonyhubjs-discover");
const Util = require("util");

const DISCOVERY_PORT = 61991;
const CODE_OK = 200;

module.exports = class HarmonyHub {
  constructor() {
    this.hubs = new Map();
    this.discovery = new HarmonyHubDiscover(DISCOVERY_PORT);

    this._events = new Map([
      ["online", hub => this.onHubOnline(hub)],
      ["offline", hub => this.onHubOffline(hub)]
    ]);
    for (let [eventName, handler] of this._events) {
      this.discovery.on(eventName, handler);
    }

    // Start looking around for hubs.
    this.discovery.start();
  }

  destructor() {
    this.disconnect();
    for (let [eventName, handler] of this._events) {
      this.instance.off(eventName, handler);
    }
  }

  disconnect() {
    if (this._disconnecting) {
      return;
    }
    this._disconnecting = true;
    this.discovery.stop();
    for (let hub of this.hubs.values()) {
      hub.client.close();
    }
    this.hubs.clear();
    this._disconnecting = false;
  }

  async onHubOnline(hub) {
    if (this.hubs.has(hub.ip)) {
      // If we already know about this hub, it means that we also have a connected
      // client. For good measure, we'll take this as a hint to re-establish the
      // connection and clean up first.
      this.onHubOffline(hub);
    }

    this.hubs.set(hub.ip, hub);
    hub.client = new HarmonyHubClient();
    hub.client.once("close", () => this.onHubOffline(hub));
    await hub.client.connect(hub.ip);

    let res = await hub.client.getConfig();
    if (res.code != CODE_OK || !res.data) {
      throw new Error("Could not get a list of commands from hub " + hub.ip);
    }
    hub.commands = res.data;

    hub.activities = new Map();
    if (hub.commands.activity) {
      for (let activity of hub.commands.activity) {
        hub.activities.set(activity.label.trim().toLowerCase(), activity);
      }
    }
    hub.devices = new Map();
    if (hub.commands.device) {
      for (let device of hub.commands.device) {
        hub.devices.set(device.label.trim().toLowerCase(), device);
      }
    }

    hub.currentActivity = this.getActivityByID(hub, await hub.client.getCurrentActivity());

    this.emit("hub", hub);
  }

  onHubOffline({ip}) {
    const hub = this.hubs.get(ip);
    if (!hub) {
      return;
    }

    hub.client.close();
    this.hubs.delete(hub.ip)
  }

  getHub(hubNameOrIP) {
    let hub;
    hubNameOrIP = hubNameOrIP.toLowerCase();
    if (/^[0-9\.]+$/.test(hubNameOrIP)) {
      hub = this.hubs.get(hubNameOrIP);
    } else {
      for (let h of this.hubs.values()) {
        if ((h.host_name && h.host_name.toLowerCase() == hubNameOrIP) ||
            (h.friendlyName && h.friendlyName.toLowerCase() == hubNameOrIP)) {
          hub = h;
          break;
        }
      }
    }
    if (!hub) {
      throw new Error(`No hub found that can be identified with '${hubNameOrIP}'`);
    }
    return hub;
  }

  withHub(hubNameOrIP) {
    let hub = this.getHub(hubNameOrIP);
    
    let api = {};
    for (let func of ["startActivity", "sendCommand"]) {
      api[func] = (...args) => {
        return this[func](hub, ...args);
      };
    }
    return api;
  }

  getActivityByID(hub, activityID) {
    for (let activity of hub.activities.values()) {
      if (activity.id != activityID) {
        continue;
      }
      return activity;
    }

    // By default, return 'off'.
    return { id: "-1" };
  }

  matchesCurrentActivity(hub, activityName) {
    const activityNameLC = activityName.toLowerCase();
    let activity = activityNameLC == "off" ? { id: "-1" } : hub.activities.get(activityNameLC);
    if (!activity || !hub.currentActivity) {
      return false;
    }

    return hub.currentActivity.id == activity.id;
  }

  isOff(hub) {
    // Kick off an update in the background, because we want to keep this one sync.
    this.updateCurrentActivity(hub);
    return hub.currentActivity.id == "-1";
  }

  async startActivity(hub, activityName) {
    // First find the hub, if we didn't get an object passed in.
    if (typeof hub == "string") {
      hub = this.getHub(hub);
    }

    const activityNameLC = activityName.toLowerCase();
    let activity = activityNameLC == "off" ? { id: "-1" } : hub.activities.get(activityNameLC);
    if (!activity) {
      throw new Error(`No activity found with name '${activityName}'`);
    }

    let currentActivityID = await this.updateCurrentActivity(hub);
    // If the activity we want to start is already active, we've got nothing to do.
    if (currentActivityID == activity.id) {
      hub.currentActivity = activity;
      return;
    }
    // If another activity is currently active, make sure to turn it off first.
    if (activity.id != "-1" && currentActivityID != "-1") {
      await hub.client.startActivity("-1");
    }
    await hub.client.startActivity(activity.id);
    hub.currentActivity = activity;
  }

  updateCurrentActivity(hub) {
    if (this._updatingPromise) {
      return this._updatingPromise.promise;
    }
    let defer = this._updatingPromise = {};
    defer.promise = new Promise(resolve => {
      defer.resolve = resolve;
    });
    hub.client.getCurrentActivity().then(activityID => {
      hub.currentActivity = this.getActivityByID(hub, activityID);
      defer.resolve(activityID);
      this._updatingPromise = null;
    });
    return defer.promise;
  }

  sendCommand(hub, deviceHint, actionHint) {
    // First find the hub, if we didn't get an object passed in.
    if (typeof hub == "string") {
      hub = this.getHub(hub);
    }

    // Find the device from the list.
    // Try the cheapest action first:
    let device = hub.devices.get(deviceHint);
    if (!device) {
      // Do a substring match on device label, starting from the end.
      // ex. ' Samsung TV '.trim().toLowerCase().endsWith('tv');
      let deviceHintLC = deviceHint.toLowerCase();
      for (let d of hub.devices.values()) {
        if (d.label.trim().toLowerCase().endsWith(deviceHintLC) ||
            (d.deviceTypeDisplayName && d.deviceTypeDisplayName.toLowerCase().endsWith(deviceHintLC))) {
          device = d;
          break;
        }
      }
    }
    if (!device) {
      throw new Error(`No device found that could be identified with '${deviceHint}'`)
    }

    // Find the group of controls from the list provided by the device.
    let controlsGroup;
    let actionHintLC = actionHint.toLowerCase();
    for (let group of device.controlGroup) {
      if (actionHintLC.startsWith(group.name.trim().toLowerCase())) {
        controlsGroup = group;
      }
    }
    if (!controlsGroup) {
      throw new Error("No group of controls found that could be identified " +
        `using '${actionHint}' on device '${device.label}'`);
    }

    let func;
    for (let f of controlsGroup.function) {
      if (actionHintLC.endsWith(f.name.trim().toLowerCase())) {
        func = f;
        break;
      }
    }
    if (!func) {
      throw new Error("No function found that could be identified in the group " +
        `of controls '${controlsGroup.name}' using '${actionHint}' on device '${device.label}'`);
    }

    const encodedAction = func.action.replace(/\:/g, "::");
    return hub.client.sendCommand(encodedAction);
  }
};

Util.inherits(module.exports, Events.EventEmitter);
