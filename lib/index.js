'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _deps = require('./deps');

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var SyncComponent = function (_React$Component) {
  _inherits(SyncComponent, _React$Component);

  function SyncComponent() {
    var _ref;

    _classCallCheck(this, SyncComponent);

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var _this = _possibleConstructorReturn(this, (_ref = SyncComponent.__proto__ || Object.getPrototypeOf(SyncComponent)).call.apply(_ref, [this].concat(args)));

    _this.sync = new Sync(_this);
    return _this;
  }

  _createClass(SyncComponent, [{
    key: 'render',
    value: function render() {
      return this.props.children;
    }
  }, {
    key: 'componentDidMount',
    value: function componentDidMount() {
      this.sync.connect();
    }
  }, {
    key: 'componentWillUnmount',
    value: function componentWillUnmount() {
      this.sync.disconnect();
    }
  }]);

  return SyncComponent;
}(_react2.default.Component);

var Sync = function () {
  function Sync(component) {
    _classCallCheck(this, Sync);

    this.component = component;
    this.reset();
  }

  _createClass(Sync, [{
    key: 'reset',
    value: function reset() {
      this.credentials = null;

      this.lockedBy = null;
      this.lockRequested = false;
      this.lockingRemote = false;

      this.pendingState = null;
      this.lastState = null;
      this.stateId = -1;
    }
  }, {
    key: 'connect',
    value: function connect() {
      var _this2 = this;

      var params = this.component.props.sync;
      var hub = this.hub = (0, _deps.signalhub)(params.name, params.servers);

      var swarm = this.swarm = (0, _deps.wrtcswarm)(hub, {});
      this.credentials = params.credentials;

      if ('autolock' in params) {
        this.autolock = params.autolock;
      } else {
        this.autolock = {
          // Timeout 5 seconds
          timeout: 1000 * 5
        };
      }

      swarm.on('peer', function (peer, id) {
        console.log('connected to a new peer:', id);
        console.log('total peers:', swarm.peers.length);

        _this2.sendActionTo(id, 'initial-state', {
          id: _this2.stateId,
          state: _this2.lastState
        });

        if ((_this2.lockRequested || _this2.lockingRemote) && !_this2.lockedBy) {
          _this2.sendActionTo(id, 'lock-request', _this2.getLockData());
        }

        peer.on('data', function (payload) {
          try {
            payload = JSON.parse(payload + '');
          } catch (e) {
            _this2.error('Receive parse error', e);
            return;
          }

          switch (payload.action) {
            case 'lock-request':
              {
                _this2.lockSelfBy(id, payload.data);
              }break;
            case 'self-locked':
              {
                _this2.confirmRemoteLocking();
              }break;
            case 'cancel-lock':
              {
                _this2.cancelSelfLock(id);
              }break;
            case 'lock-error':
              {
                _this2.lockingError();
              }break;
            case 'initial-state':
              {
                _this2.setInitialState(payload.data);
              }break;
            case 'set-state':
              {
                _this2.receiveState(payload.data);
              }break;
          }
        });

        _this2.fireEvent('onRemotePeer', id);
      });

      swarm.on('disconnect', function (peer, id) {
        console.log('disconnected from a peer:', id);
        console.log('total peers:', swarm.peers.length);

        if (_this2.lockedBy === id) {
          _this2.unlockSelf();
        }
      });
    }
  }, {
    key: 'disconnect',
    value: function disconnect() {
      this.swarm.close();
      this.reset();
    }
  }, {
    key: 'lockingError',
    value: function lockingError() {
      this.pendingState = null;
      this.unlockRemotes();
    }
  }, {
    key: 'cancelSelfLock',
    value: function cancelSelfLock(id) {
      // Cancel only if locked this given peer
      if (this.lockedBy === id) {
        this.unlockSelf();
      }
    }
  }, {
    key: 'confirmRemoteLocking',
    value: function confirmRemoteLocking() {
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
  }, {
    key: 'lockSelfBy',
    value: function lockSelfBy(id, data) {
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
  }, {
    key: 'unlockSelf',
    value: function unlockSelf() {
      this.lockedBy = null;
      this.fireEvent('onSelfUnlocked');
    }
  }, {
    key: 'requestLock',
    value: function requestLock() {
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
  }, {
    key: 'remotesLockError',
    value: function remotesLockError() {
      this.fireEvent('onRemotesLockError');
    }
  }, {
    key: 'remotesLockSuccess',
    value: function remotesLockSuccess() {
      this.fireEvent('onRemotesLocked');
    }
  }, {
    key: 'getLockData',
    value: function getLockData() {
      return {
        credentials: this.credentials
      };
    }
  }, {
    key: 'unlockRemotes',
    value: function unlockRemotes() {
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
  }, {
    key: 'cancelLockRequest',
    value: function cancelLockRequest() {
      var errback = this.lockRequested[1];
      this.lockRequested = null;
      this.remotesLockError();
      this.broadcastAction('cancel-lock');

      this.clearAutolockTimer();
    }
  }, {
    key: 'clearAutolockTimer',
    value: function clearAutolockTimer() {
      if (this.autolockTimer) {
        clearTimeout(this.autolockTimer);
        this.autolockTimer = null;
      }
    }
  }, {
    key: 'setAutolockTimer',
    value: function setAutolockTimer() {
      var _this3 = this;

      if (!this.autolock) return;

      if (this.autolock.timeout) {
        this.clearAutolockTimer();
        this.autolockTimer = setTimeout(function () {
          _this3.unlockRemotes();
        }, this.autolock.timeout);
      }
    }
  }, {
    key: 'broadcastAction',
    value: function broadcastAction(name, data) {
      var swarm = this.swarm;
      var payload = void 0;

      try {
        payload = JSON.stringify({
          action: name,
          data: data || null
        });
      } catch (e) {
        this.error('Send parse error', e);
        return false;
      }

      for (var i = 0; i < swarm.peers.length; i++) {
        var peer = swarm.peers[i];
        peer.send(payload);
      }

      return true;
    }
  }, {
    key: 'sendActionTo',
    value: function sendActionTo(id, name, data) {
      var peer = this.swarm.remotes[id];
      if (!peer) return false;

      var payload = void 0;

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
  }, {
    key: 'setInitialState',
    value: function setInitialState(data) {
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
  }, {
    key: 'sendState',
    value: function sendState(state) {
      this.stateId = this.stateId + 1;
      this.lastState = state;

      this.setAutolockTimer();

      this.broadcastAction('set-state', {
        id: this.stateId,
        state: state
      });
    }
  }, {
    key: 'receiveState',
    value: function receiveState(data) {
      if (!data || !isFinite(data.id) || !data.state) return;

      this.stateId = data.id;
      this.lastState = data.state;

      this.fireEvent('onStateReceived', data.state, data.id);
    }
  }, {
    key: 'setState',
    value: function setState(state) {
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
      } else {}
    }
  }, {
    key: 'fireEvent',
    value: function fireEvent(event, data) {
      var fn = this.component[event] || this.component.props[event];
      if (!fn) return false;

      if (arguments.length > 2) {
        fn.apply(this.component, [].slice.call(arguments, 1));
      } else {
        fn.call(this.component, data);
      }

      return true;
    }
  }, {
    key: 'numberOfPeers',
    value: function numberOfPeers() {
      return this.swarm.peers.length;
    }
  }]);

  return Sync;
}();

exports.default = SyncComponent;

SyncComponent.Sync = Sync;
module.exports = exports['default'];
