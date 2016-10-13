var React = require('react');
var ReactDOM = require('react-dom');
var SyncComponent = require('.');

class Counter extends SyncComponent {
  constructor(...args) {
    super(...args);
    this.state = {
      counter: 0
    };

    this.tick = () => {
      if (this.state.lockedBy) return;

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

  onRemotesLocked() {
    this.setState({
      editing: true
    });
  }

  onRemotesUnlocked() {
    this.setState({
      editing: false
    });
  }

  onRemotesLockError() {
    this.setState({
      editing: false
    });
  }

  onRemotePeer(id) {
    this.setState({
      clients: this.sync.numberOfPeers()
    });
  }

  render() {
    return <div className="test">
      <div style={{
        fontSize: '12px',
        marginBottom: '10px'
      }}>
        Connected clients: { this.state.clients }
      </div>

      Counter: { this.state.counter }&nbsp;&nbsp;
      <button type="button" onClick={ this.tick }
        disabled={ !!this.state.lockedBy }
      >Tick</button>

      { this.state.lockedBy ?
        <div>
          <hr />
          <span style={{ fontSize: '12px', color: 'gray' }}>
            Locked by: { this.state.lockedBy } ...
          </span>
        </div>
      : null }

      { this.state.editing ?
        <div style={{
          padding: '4px 6px',
          marginTop: '10px',
          background: 'green',
          color: 'white'
        }} onClick={() => {
          this.sync.unlockRemotes();
        }}>
          Click here to finish editing
        </div>
      : null }
    </div>
  }
}

class App extends React.Component {
  constructor(...args) {
    super(...args);
    this.state = {};
  }

  render() {
    if (this.state.connected) {
      return <Counter sync={{
        servers: ['http://192.168.1.50:4242'],
        name: 'test',
        credentials: {
          name: this.state.name
        }
      }} />;
    }

    return <div>
      <input placeholder="Enter your name" type="text" ref="text" onChange={() => {}} /><button type="button" onClick={() => {
        this.setState({
          name: this.refs.text.value,
          connected: true
        });
      }}>Continue</button>
    </div>
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(<App />, document.querySelector('#app'));
});