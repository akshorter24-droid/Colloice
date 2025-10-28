const startStreamButton = document.getElementById('start-stream');
const callButton = document.getElementById('call-button');
const hangupButton = document.getElementById('hangup-button');
const statusDisplay = document.getElementById('status');
const remoteAudio = document.getElementById('remote-audio');

let localStream = null;
let ws = null; 
let peerConnection = null;
let isCaller = false; 
const WS_SERVER_URL = 'wss://https://backend-ntgs.onrender.com';

// STUN server configuration for NAT traversal
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// --- Helper Functions ---

function logStatus(message) {
    statusDisplay.textContent = `Status: ${message}`;
    console.log(`[Status] ${message}`);
}

function updateButtons(streamActive, wsConnected, callActive, canCall) {
    startStreamButton.disabled = streamActive;
    callButton.disabled = !wsConnected || !canCall || callActive;
    hangupButton.disabled = !callActive;
}

// --- WebSocket Signaling ---

function connectToServer() {
    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => {
        logStatus('Connected to Signaling Server. Waiting for peer assignment.');
        updateButtons(true, true, false, false);
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'status':
                logStatus(data.message);
                break;
            case 'peer_joined':
                isCaller = true; // This peer initiates the call (Peer 1)
                logStatus(data.message);
                updateButtons(true, true, false, true);
                break;
            case 'offer':
                isCaller = false; 
                await handleOffer(data.sdp);
                break;
            case 'answer':
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                logStatus('Received Answer. Call connected!');
                updateButtons(true, true, true, false);
                break;
            case 'candidate':
                await handleCandidate(data.candidate);
                break;
            case 'disconnection':
                logStatus(data.message);
                hangUp();
                break;
            case 'hangup':
                 logStatus('Call ended by remote peer.');
                 hangUp();
                 break;
        }
    };

    ws.onerror = (error) => {
        logStatus('Connection error with Signaling Server. Check console.', true);
        console.error('WebSocket Error:', error);
        updateButtons(true, false, false, false);
    };
}


// --- WebRTC Logic ---

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks (microphone audio)
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote tracks (audio from the other peer)
    peerConnection.ontrack = (event) => {
        if (remoteAudio.srcObject !== event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play(); // Start playing the remote audio
        }
    };

    // Send ICE candidates to the other peer via the signaling server
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'candidate', 
                candidate: event.candidate 
            }));
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE state:', peerConnection.iceConnectionState);
    };
}


// 1. Start Stream (Microphone Access)
startStreamButton.addEventListener('click', async () => {
    try {
        logStatus('Requesting microphone access...');
        
        // Request audio access
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        
        // Play local audio for self-test (optional, but good for testing)
        // const localAudio = new Audio();
        // localAudio.srcObject = localStream;
        // localAudio.play();
        
        logStatus('Microphone stream active. Connecting to server...');
        connectToServer();
        updateButtons(true, true, false, false);

    } catch (error) {
        logStatus(`Error: ${error.name}. Please ensure microphone is available.`, true);
        console.error(error);
    }
});


// 2. Start Call (Caller's role)
callButton.addEventListener('click', async () => {
    if (!localStream || !isCaller) return;
    
    logStatus('Creating WebRTC Offer...');
    createPeerConnection();

    // 1. Create Offer
    const offer = await peerConnection.createOffer();
    
    // 2. Set and Send Offer
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ 
        type: 'offer', 
        sdp: peerConnection.localDescription 
    }));
    
    logStatus('Offer sent. Waiting for Answer...');
    updateButtons(true, true, false, false);
});


// 3. Handle Offer (Answerer's role)
async function handleOffer(offer) {
    logStatus('Received Offer. Creating Answer...');
    
    createPeerConnection(); 

    // 1. Set Remote Description (the Offer)
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // 2. Create Answer
    const answer = await peerConnection.createAnswer();

    // 3. Set and Send Answer
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ 
        type: 'answer', 
        sdp: peerConnection.localDescription 
    }));
    
    logStatus('Answer sent. Connection should be establishing...');
    updateButtons(true, true, true, false);
}

// 4. Handle ICE Candidate
async function handleCandidate(candidate) {
    if (peerConnection && peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            // console.log('Successfully added ICE candidate.');
        } catch (e) {
            console.error('Error adding received ICE candidate:', e);
        }
    }
}

// 5. Hang Up
hangupButton.addEventListener('click', hangUp);

function hangUp() {
    if (peerConnection) {
        // Send hangup signal to the other peer
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'hangup' }));
        }

        // Close WebRTC connection
        peerConnection.close();
        peerConnection = null;
    }
    
    // Stop local media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Reset UI
    logStatus('Call ended. Microphone stream stopped.');
    updateButtons(false, false, false, false);
    startStreamButton.disabled = false;
    
    // Optionally close WebSocket to enforce a new room session
    if (ws) {
        ws.close();

        // In script.js:
const configuration = {
    iceServers: [
        // These are free, public, and essential for finding public IPs
        { urls: 'stun:stun.l.google.com:19302' }, 
        { urls: 'stun:stun1.l.google.com:19302' }
        // For maximum compatibility (strict firewalls), you would need to add a TURN server here.
    ]
};
    }

}
