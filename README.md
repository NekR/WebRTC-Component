# WebRTC Syncing React Component

## Overview

This component intended to be used to synchronize same instances of it between each other using WebRTC (peer-to-peer) connection. Even though it's a peer-to-peer connection it still cannot work without a server of some sort. Server here is needed to _establish a connection_ and let peers know about each other (this process is called _signaling_). After that, peers are sending data and messages directly to other peers, without involving the server.

It uses [webrtc-swarm](https://github.com/mafintosh/webrtc-swarm) under the hood, which uses [signalhub](https://github.com/mafintosh/signalhub) and [simple-peer](https://github.com/feross/simple-peer).

### Terminology

* **Lock**/**Locking** -- one component taking a control over all other components. The component taking a control is **locking** all other components. All other components are **locked**. When a component is **locked** is cannot send states to other components. Only one component at a time can be **locking** other components.

## Running the server

To run the server you need to install `signalhub` globally (or locally and use `./node_modules/.bin/signalhub`):

```
  npm install signalhub -g

  # starts a signalhub server on 127.0.0.1:8080
  signalhub listen -p 8080 -h 127.0.0.1
```

## Using the component

`SyncComponent` can be used as a base class (instead of `React.Component`) or as a standalone component instance inside another component.

#### As a base class example

```js
class Counter extends SyncComponent {
  static defaultProps = {
    servers: ['http://192.168.1.50:4242'],
    name: 'counter',
    credentials: {}
  }

  constructor(...args) {
    super(...args);
  }

  onStateReceived(state) {
    this.setState(state);
  }

  render() {
    return <div>...</div>
  }
}
```

_For more detailed example see `examples/counter/index.js`_

**Important not here** is if you are using `componentDidMount` or `componentWillUnmount` in your component, then you need to call `super.component*()` to make `SyncComponent` work (because it uses other methods too). Example:

```js

componentDidMount() {
  super.componentDidMount();
  // ... other things
}

```

#### As a standalone instance example

```js
class Counter extends SyncComponent {
  constructor(...args) {
    super(...args);
  }

  render() {
    return <div>
      <SyncComponent sync={{
        servers: ['http://192.168.1.50:4242'],
        name: 'counter',
        credentials: {}
      }} onStateReceived={(state) => {
        this.setState(state);
      }} />
    </div>
  }
}
```

#### Other ways

No other ways are implemented yet. Though, if it will be needed, it can be possible to add a "Higher Order Component" composition way of using this component.

## API

### Configuration

Configuration to the component is passed as a `sync` prop (you may want to set it in `defaultProps`) though. Example:

```js
defaultProps = {
  sync: {
    // List of servers to use as "signaling servers".
    // Servers must be `signalhub` servers
    servers: ['...'],
    // The name of this component's connection. `signalhub` server can handle
    // many different connection from different components at the same time,
    // so it's necessary to specify an unique name of your components' connection.
    name: 'tardis-calendar',
    // If set, component automatically calls `sync.requestLock()` (editing mode)
    // when `sync.setState()` is called. If timeout is set, locking will be
    // canceled once it's passed. By default it's set and timeout is 5 seconds
    autolock: { timeout: 5000 },
    // Object with custom data. Specified data will be passed to the `onLockedBy` event
    // of other (remote) components when one component starts updating its state.
    // This allows to provide info and display "XYZ is editing"
    credentials: {}
  }
}
```

### `this.sync`

Instance of the `Sync` class used internally by the component. All manipulations are performed with this object.

#### `this.sync.setState(state)`

Sends state to other (remote) components. Doesn't affect the component being called on.
Typical you may want to call it right after `this.setState()`, like this:

```js
var newState = {
  counter: this.state.counter
};

this.setState(newState);
this.sync.setState(newState)
```

#### `this.sync.requestLock()`

Sends a lock request to other (remote) components. This request is not guaranteed to succeed. For example it may fail if 2 component send a request at the same time. In which case both requests may fail, or just one and the other one succeed. This depends on network state, speed and when requests where called.

#### `this.sync.unlockRemotes()`

The opposite of `requestLock()`. When called, it cancels existing lock requests and unlocks remote components if lock was already performed.

#### `this.sync.lockedBy`

Property which is equal to an unique id of the component locking current component, if any. If current component isn't locked, this property is `null`.

#### `this.sync.lockRequested`

True when lock was requested via `requestLock()` but wasn't yet succeeded or failed.

#### `this.sync.lockingRemote`

This property is true when current component is locking other (remote) components.


### Events

Events are either passed as `props` to an instance of `SyncComponent` or placed on a component extending the `SyncComponent`.

#### `onStateReceived(state)`

Called when state is received from other (remote) component.

#### `onLockedBy(data)`

Called when an other component established lock on the current component. `credentials` data of the locking component are passed as `data.credentials`.

#### `onSelfUnlocked()`

Called when current component isn't being locked by any other component anymore.

#### `onRemotesLocked()`

Called when current component established locking over other (remote) components.

#### `onRemotesUnlocked()`

Called when current component stops locking other (remote) components.

#### `onRemotesLockError()`

Called when lock request from current component failed.

#### `onRemotePeer(id)`

Called when other (remote) component (peer) is connected to the current component.

## Run `examples/counter`

1. First install the component if you didn't do that before `npm install`
2. Run `npm run counter:compile`
3. In a first console run `npm run hub`
4. In a second console run `npm run counter:server`
5. Open http://localhost:4141/ in your browser
