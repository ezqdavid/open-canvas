use libp2p::{
    core::upgrade::Version,
    futures::StreamExt,
    mdns,
    noise,
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId, Swarm, Transport,
};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;
use tauri::Window;
use tokio::sync::mpsc;

// Custom behavior combining mDNS discovery with standard peer networking
#[derive(NetworkBehaviour)]
#[behaviour(out_event = "CanvasBehaviourEvent")]
pub struct CanvasBehaviour {
    pub mdns: mdns::tokio::Behaviour,
}

#[derive(Debug)]
pub enum CanvasBehaviourEvent {
    Mdns(mdns::Event),
}

impl From<mdns::Event> for CanvasBehaviourEvent {
    fn from(event: mdns::Event) -> Self {
        CanvasBehaviourEvent::Mdns(event)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PeerDiscoveredPayload {
    #[serde(rename = "peerId")]
    pub peer_id: String,
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CrdtUpdatePayload {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    #[serde(rename = "updateHex")]
    pub update_hex: String,
}

pub struct P2PManager {
    pub peer_id: PeerId,
    pub tx: mpsc::UnboundedSender<String>,
}

impl P2PManager {
    pub fn new(window: Window) -> Result<Self, Box<dyn Error>> {
        // Generate a random local peer ID
        let local_key = libp2p::identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());
        println!("Local Rust Libp2p Peer ID: {:?}", local_peer_id);

        // Setup custom Tokio channel to receive commands from Tauri JS IPC thread
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // Build the transport pipeline: TCP + Noise + Yamux
        let transport = tcp::tokio::Transport::default()
            .upgrade(Version::V1Lazy)
            .authenticate(noise::Config::new(&local_key)?)
            .multiplex(yamux::Config::default())
            .boxed();

        // Configure mDNS local discovery
        let mdns_config = mdns::Config {
            ttl: Duration::from_secs(60),
            query_interval: Duration::from_secs(15),
            enable_ipv6: false,
        };
        let mdns_behaviour = mdns::tokio::Behaviour::new(mdns_config, local_peer_id)?;

        let behaviour = CanvasBehaviour { mdns: mdns_behaviour };

        let mut swarm = Swarm::Builder::with_tokio_executor(transport, behaviour, local_peer_id).build();

        // Listen on all local TCP interfaces on port 0 (auto-allocated by OS)
        swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

        // Spawn async background processing thread
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // 1. Process network swarm events
                    event = swarm.select_next_some() => match event {
                        SwarmEvent::NewListenAddr { address, .. } => {
                            println!("Local node is actively listening on address: {:?}", address);
                        }
                        SwarmEvent::Behaviour(CanvasBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                            for (peer_id, addr) in list {
                                println!("mDNS discovered remote peer: {:?}", peer_id);
                                let _ = swarm.dial(addr.clone());
                                
                                // Relay peer discovery event up to React UI
                                let payload = PeerDiscoveredPayload {
                                    peer_id: peer_id.to_string(),
                                    name: Some(format!("Local Peer {}", &peer_id.to_string()[..5])),
                                };
                                let _ = window.emit("libp2p-peer-discovered", payload);
                            }
                        }
                        SwarmEvent::Behaviour(CanvasBehaviourEvent::Mdns(mdns::Event::Expired(list))) => {
                            for (peer_id, _) in list {
                                println!("mDNS peer expired: {:?}", peer_id);
                            }
                        }
                        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                            println!("Connected to peer: {:?}", peer_id);
                        }
                        SwarmEvent::ConnectionClosed { peer_id, .. } => {
                            println!("Connection closed with peer: {:?}", peer_id);
                        }
                        _ => {}
                    },

                    // 2. Process incoming commands from Javascript IPC
                    Some(crdt_msg) = rx.recv() => {
                        // Simply logs outgoing sync states in current prototype phase.
                        // In Phase 2, this writes updates over libp2p request-response protocol stream
                        println!("Rust-P2P: Syncing Yjs CRDT frame over Mesh network: {}", crdt_msg);
                    }
                }
            }
        });

        Ok(P2PManager {
            peer_id: local_peer_id,
            tx,
        })
    }
}
