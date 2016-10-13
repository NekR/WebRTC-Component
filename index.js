var wrtcswarm = require('webrtc-swarm');
var signalhub = require('signalhub');

var React = require('react');
var ReactDOM = require('react-dom');

class Sync {
  constructor(component) {
    this.component = component;
    this.reset();
  }

  reset() {
    this.credentials = null;

    this.lockedBy = null;
    this.lockRequested = false;
    this.lockingRemote = false;

    this.pendingState = null;
    this.lastState = null;
    this.stateId = -1;
  }

  connect() {
    const params = this.component.props.sync;
    const hub = this.hub = signalhub(
      params.name,
      params.servers
    );

    const swarm = this.swarm = wrtcswarm(hub, {});
    this.credentials = params.credentials;

    if ('autolock' in params) {
      this.autolock = params.autolock;
    } else {
      this.autolock = {
        // Timeout 5 seconds
        timeout: 1000 * 5
      };
    }

    swarm.on('peer', (peer, id) => {
      console.log('connected to a new peer:', id)
      console.log('total peers:', swarm.peers.length);

      this.sendActionTo(id, 'initial-state', {
        id: this.stateId,
        state: this.lastState
      });

      if ((this.lockRequested || this.lockingRemote) && !this.lockedBy) {
        this.sendActionTo(id, 'lock-request', this.getLockData());
      }

      peer.on('data', (payload) => {
        try {
          payload = JSON.parse(payload + '');
        } catch (e) {
          this.error('Receive parse error', e);
          return;
        }

        switch (payload.action) {
          case 'lock-request': {
            this.lockSelfBy(id, payload.data);
          } break;
          case 'self-locked': {
            this.confirmRemoteLocking();
          } break;
          case 'cancel-lock': {
            this.cancelSelfLock(id);
          } break;
          case 'lock-error': {
            this.lockingError();
          } break;
          case 'initial-state': {
            this.setInitialState(payload.data);
          } break;
          case 'set-state': {
            this.receiveState(payload.data);
          } break;
        }
      });
    });

    swarm.on('disconnect', (peer, id) => {
      console.log('disconnected from a peer:', id)
      console.log('total peers:', swarm.peers.length)

      if (this.lockedBy === id) {
        this.unlockSelf();
      }
    });
  }

  disconnect() {
    this.swarm.close();
    this.reset();
  }

  lockingError() {
    this.pendingState = null;
    this.unlockRemotes();
  }

  cancelSelfLock(id) {
    // Cancel only if locked this given peer
    if (this.lockedBy === id) {
      this.unlockSelf();
    }
  }

  confirmRemoteLocking() {
    // Already confirmed
    if (this.lockingRemote) return;

    if (this.lockedBy) {
      // If already locked when confirm arrives,
      // cancel all possible existing locks by this

      this.broadcastAction('cancel-lock');
      return;
    }

    if (!this.lockRequested) {
      // Ignore if not requested
      return;
    }

    this.lockRequested = false;
    this.lockingRemote = true;
    this.remotesLockSuccess();

    if (this.pendingState) {
      this.sendState(this.pendingState);
      this.pendingState = null;
    }
  }

  lockSelfBy(id, data) {
    if (this.lockingRemote) {
      // Don't allow locking itself if it's already locking some peer.
      // Send a error back

      this.sendActionTo(id, 'lock-error', {
        lockingRemote: true
      });

      return;
    }

    if (this.lockRequested) {
      // This peer requested a lock, but got locked by another peer faster.
      // Ignore lock from this peer and broadcast `cancel-lock` to remote peers;
      this.cancelLockRequest();
    }

    if (this.lockedBy) {
      if (this.lockedBy === id) {
        // Ignore if already locked by the same peer (probably race happened)
      } else {
        this.sendActionTo(id, 'lock-error', {
          alreadyLocked: true
        });
      }

      return;
    }

    // Lock itself
    // No input should be allowed now
    this.lockedBy = id;
    this.sendActionTo(id, 'self-locked');
    this.fireEvent('onLockedBy', {
      credentials: data.credentials,
      id: id
    });
  }

  unlockSelf() {
    this.lockedBy = null;
    this.fireEvent('onSelfUnlocked');
  }

  requestLock() {
    if (this.lockedBy) {
      // Don't request a lock if locked itself
      this.remotesLockError();
      return;
    }

    if (this.lockRequested || this.lockingRemote) {
      // Don't allow double lock;
      this.remotesLockError();
      return;
    }

    this.lockRequested = true;

    if (this.swarm.peers.length) {
      this.broadcastAction('lock-request', this.getLockData());
    } else {
      this.confirmRemoteLocking();
    }
  }

  remotesLockError() {
    this.fireEvent('onRemotesLockError');
  }

  remotesLockSuccess() {
    this.fireEvent('onRemotesLocked');
  }

  getLockData() {
    return {
      credentials: this.credentials
    };
  }

  unlockRemotes() {
    this.clearAutolockTimer();

    if (this.lockingRemote) {
      // If already locking -- release it
      this.broadcastAction('cancel-lock');
      this.lockingRemote = false;
      this.fireEvent('onRemotesUnlocked');

      return;
    }

    if (this.lockRequested) {
      this.cancelLockRequest();
      return;
    }
  }

  cancelLockRequest() {
    const errback = this.lockRequested[1];
    this.lockRequested = null;
    this.remotesLockError();
    this.broadcastAction('cancel-lock');

    this.clearAutolockTimer();
  }

  clearAutolockTimer() {
    if (this.autolockTimer) {
      clearTimeout(this.autolockTimer);
      this.autolockTimer = null;
    }
  }

  setAutolockTimer() {
    if (!this.autolock) return;

    if (this.autolock.timeout) {
      this.clearAutolockTimer();

      console.log('autolock timer updated');
      this.autolockTimer = setTimeout(() => {
        this.unlockRemotes();
      }, this.autolock.timeout);
    }
  }

  broadcastAction(name, data) {
    const swarm = this.swarm;
    let payload;

    try {
      payload = JSON.stringify({
        action: name,
        data: data || null
      });
    } catch (e) {
      this.error('Send parse error', e);
      return false;
    }

    for (let i = 0; i < swarm.peers.length; i++) {
      const peer = swarm.peers[i];
      peer.send(payload);
    }

    return true;
  }

  sendActionTo(id, name, data) {
    const peer = this.swarm.remotes[id];
    if (!peer) return false;

    let payload;

    try {
      payload = JSON.stringify({
        action: name,
        data: data || null
      });
    } catch (e) {
      this.error('Send parse error', e);
      return false;
    }

    peer.send(payload);
    return true;
  }

  setInitialState(data) {
    if (!data || !isFinite(data.id) || !data.state) return;

    // If current state is greater than received, then ignore it
    if (isFinite(this.stateId) && this.stateId > data.id) {
      return;
    }

    // Use received state otherwise
    this.stateId = data.id;
    this.lastState = data.state;

    this.receiveState(data);
  }

  sendState(state) {
    this.stateId = this.stateId + 1;
    this.lastState = state;

    this.setAutolockTimer();

    this.broadcastAction('set-state', {
      id: this.stateId,
      state: state
    });
  }

  receiveState(data) {
    if (!data || !isFinite(data.id) || !data.state) return;

    this.stateId = data.id;
    this.lastState = data.state;

    this.fireEvent('onStateReceived', data.state, data.id);
  }

  setState(state) {
    if (this.lockedBy) {
      // Do nothing if component is locked
      return false;
    }

    if (this.lockingRemote) {
      this.sendState(state);
    } else if (this.lockRequested) {
      this.pendingState = state;
    } else if (this.autolock) {
      this.pendingState = state;
      this.requestLock();
    } else {
      console.log('setState ignored', state);
    }
  }

  fireEvent(event, data) {
    const fn = this.component[event] || this.component.props[event];
    if (!fn) return false;

    if (arguments.length > 2) {
      fn.apply(this.component, [].slice.call(arguments, 1));
    } else {
      fn.call(this.component, data);
    }

    return true;
  }
}


class SyncComponent extends React.Component {
  constructor(...args) {
    super(...args);
    this.sync = new Sync(this);
  }

  render() {
    return this.props.children;
  }

  componentDidMount() {
    this.sync.connect();
  }

  componentWillUnmount() {
    this.sync.disconnect();
  }
}

class Test extends SyncComponent {
  constructor(...args) {
    super(...args);
    this.state = {
      counter: 0
    };

    this.tick = () => {
      this.setState((state, props) => {
        const newState = {
          counter: this.state.counter + 1
        };

        this.sync.setState(newState);
        return newState;
      });
    };
  }

  onStateReceived(state) {
    this.setState(state);
  }

  onLockedBy(data) {
    this.setState({
      lockedBy: data.credentials.name
    });
  }

  onSelfUnlocked() {
    this.setState({
      lockedBy: null
    })
  }

  render() {
    return <div className="test">
      Counter: { this.state.counter }&nbsp;&nbsp;
      <button type="button" onClick={ this.tick }>Tick</button>
      { this.state.lockedBy ?
        [
          <hr />,
          <span style={{ fontSize: '12px', color: 'gray' }}>
            Locked by: { this.state.lockedBy } ...
          </span>
        ]
        : null
      }
    </div>
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(<Test sync={{
    servers: ['http://192.168.1.50:4242'],
    name: 'test',
    credentials: {
      name: location.hash.slice(1)
    }
  }} />, document.querySelector('#app'));
});