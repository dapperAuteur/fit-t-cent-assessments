// frontend-app/src/main.js

// 1. Core CSS Import (from Vite template)
import './style.css'

// 2. Firebase Imports (from NPM package, as per our last decision)
// You MUST run `npm install firebase` in your frontend-app directory for these to work.
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, doc, setDoc } from "firebase/firestore";

// 3. Firebase Configuration using Vite's Environment Variables
// Ensure your .env file in frontend-app/ has these variables prefixed with VITE_
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    // measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // Uncomment if using Analytics
    // databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL, // Only if you enabled Realtime Database
};

// 4. Initialize Firebase Services (MUST be at the top after config)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Get the Auth service
const db = getFirestore(app); // Get the Firestore service


// 5. Get ALL UI Elements at the top (declared only once)
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const feedbackElement = document.getElementById('feedback');
const instructionsElement = document.getElementById('instructions');
const repCounterElement = document.getElementById('repCounter');

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const resetButton = document.getElementById('resetButton');

const authContainer = document.getElementById('auth-container');
const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginButton = document.getElementById('loginButton');
const signupButton = document.getElementById('signupButton');
const logoutButton = document.getElementById('logoutButton');
const userEmailSpan = document.getElementById('userEmail');
const authErrorSpan = document.getElementById('authError');


// 6. Global Variables for MediaPipe State (declared only once)
let camera;
let pose; // Needs to be declared here to be in scope for functions
let isCameraRunning = false;
let repCount = 0;
let squatPhase = 'up'; // 'up' or 'down'

let isGuestMode = false; // Flag to track if user is in guest mode

const guestModePromptElement = document.getElementById('guestModePrompt'); // Element to show "Log in to save/share"
const saveAssessmentButton = document.getElementById('saveAssessmentButton'); // Example button for saving
const shareAssessmentButton = document.getElementById('shareAssessmentButton'); // Example button for sharing


// --- NEW/ADJUSTED THRESHOLDS for Rep Counting ---
const SQUAT_DOWN_THRESHOLD_KNEE = 90;
const SQUAT_UP_THRESHOLD_KNEE = 160;


// --- Utility Function: Calculate Angle ---
function calculateAngle(p1, p2, p3) {
    const A = { x: p2.x - p1.x, y: p2.y - p1.y };
    const B = { x: p3.x - p1.x, y: p3.y - p1.y };
    const dotProduct = A.x * B.x + A.y * B.y;
    const magnitudeA = Math.sqrt(A.x * A.x + A.y * A.y);
    const magnitudeB = Math.sqrt(B.x * B.x + B.y * B.y);
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    const angleRad = Math.acos(dotProduct / (magnitudeA * magnitudeB));
    let angleDeg = angleRad * 180 / Math.PI;
    if (isNaN(angleDeg)) return 0;
    return angleDeg;
}

// --- Utility Function: Calculate Horizontal Distance ---
function calculateHorizontalDistance(p1, p2) {
    return Math.abs(p1.x - p2.x);
}

// --- End Utility Functions ---

if (videoElement) {
  // Ensure canvas matches video dimensions
  videoElement.addEventListener('loadeddata', () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
  }); 
}

// Initialize MediaPipe Pose Model (this happens once)
// `pose` variable is declared globally at the top
pose = new Pose({
    locateFile: (moduleFile) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${moduleFile}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Set up the onResults callback for pose detection
pose.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);

    let assessmentFeedback = [];
    let highlightLandmarks = {};
    let highlightConnections = {};

    if (results.poseLandmarks) {
        // Default drawing: green connections, red landmarks
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                        {color: '#00FF00', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks,
                        {color: '#FF0000', lineWidth: 2, radius: 5});

        // --- Overhead Squat Assessment Logic (Enhanced) ---
        const landmarks = results.poseLandmarks;
        const rightShoulder = landmarks[12];
        const leftShoulder = landmarks[11];
        const rightElbow = landmarks[14];
        const leftElbow = landmarks[13];
        const rightWrist = landmarks[16];
        const leftWrist = landmarks[15];
        const rightHip = landmarks[24];
        const leftHip = landmarks[23];
        const rightKnee = landmarks[26];
        const leftKnee = landmarks[25];
        const rightAnkle = landmarks[28];
        const leftAnkle = landmarks[27];

        // Rep Counter Logic
        if (rightKnee && leftKnee && rightHip && leftHip && rightAnkle && leftAnkle) {
            const avgKneeAngle = (calculateAngle(rightKnee, rightHip, rightAnkle) +
                                  calculateAngle(leftKnee, leftHip, leftAnkle)) / 2;

            // console.log('Knee Angle:', avgKneeAngle); // Uncomment this to debug your angles!

            if (squatPhase === 'up' && avgKneeAngle < SQUAT_DOWN_THRESHOLD_KNEE) {
                squatPhase = 'down';
                instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Hold your squat. Aim for a good depth!</p>';
            } else if (squatPhase === 'down' && avgKneeAngle > SQUAT_UP_THRESHOLD_KNEE) {
                squatPhase = 'up';
                repCount++;
                repCounterElement.textContent = `Reps: ${repCount}`;
                instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Rep complete! Stand tall. Ready for next rep.</p>';
            }
        }

        // Compensation 1: Arms Falling Forward
        if (rightShoulder && rightElbow && rightWrist && leftShoulder && leftElbow && leftWrist) {
            const rightElbowAngle = calculateAngle(rightElbow, rightShoulder, rightWrist);
            const leftElbowAngle = calculateAngle(leftElbow, leftShoulder, leftWrist);
            const straightArmThreshold = 160;

            if (rightElbowAngle < straightArmThreshold || leftElbowAngle < straightArmThreshold) {
                assessmentFeedback.push('Arms falling forward (bent elbows).');
                highlightLandmarks[14] = { color: 'orange', radius: 8 };
                highlightLandmarks[13] = { color: 'orange', radius: 8 };
                highlightLandmarks[16] = { color: 'orange', radius: 8 };
                highlightLandmarks[15] = { color: 'orange', radius: 8 };
                highlightConnections[[12,14].sort((a,b) => a - b).join(',')] = { color: 'orange', lineWidth: 6 };
                highlightConnections[[11,13].sort((a,b) => a - b).join(',')] = { color: 'orange', lineWidth: 6 };
                highlightConnections[[14,16].sort((a,b) => a - b).join(',')] = { color: 'orange', lineWidth: 6 };
                highlightConnections[[13,15].sort((a,b) => a - b).join(',')] = { color: 'orange', lineWidth: 6 };
            }
        }

        // Compensation 2: Excessive Forward Lean
        if (rightShoulder && rightHip && rightKnee && leftShoulder && leftHip && leftKnee) {
            const rightHipAngle = calculateAngle(rightHip, rightShoulder, rightKnee);
            const leftHipAngle = calculateAngle(leftHip, leftShoulder, leftKnee);
            const forwardLeanThreshold = 100;

            if (rightHipAngle < forwardLeanThreshold || leftHipAngle < forwardLeanThreshold) {
                assessmentFeedback.push('Excessive forward lean.');
                highlightLandmarks[24] = { color: 'yellow', radius: 8 };
                highlightLandmarks[23] = { color: 'yellow', radius: 8 };
                highlightConnections[[12,24].sort((a,b) => a - b).join(',')] = { color: 'yellow', lineWidth: 6 };
                highlightConnections[[11,23].sort((a,b) => a - b).join(',')] = { color: 'yellow', lineWidth: 6 };
                highlightConnections[[24,26].sort((a,b) => a - b).join(',')] = { color: 'yellow', lineWidth: 6 };
                highlightConnections[[23,25].sort((a,b) => a - b).join(',')] = { color: 'yellow', lineWidth: 6 };
            }
        }

        // Compensation 3: Knees Valgus (Knees move inward)
        if (rightKnee && leftKnee && rightAnkle && leftAnkle) {
            const kneeHorizontalDistance = calculateHorizontalDistance(rightKnee, leftKnee);
            const ankleHorizontalDistance = calculateHorizontalDistance(rightAnkle, leftAnkle);
            const valgusRatioThreshold = 0.8;
            if (kneeHorizontalDistance < (ankleHorizontalDistance * valgusRatioThreshold)) {
                assessmentFeedback.push('Knees moving inward (Valgus).');
                highlightLandmarks[26] = { color: 'purple', radius: 8 };
                highlightLandmarks[25] = { color: 'purple', radius: 8 };
                highlightConnections[[24,26].sort((a,b) => a - b).join(',')] = { color: 'purple', lineWidth: 6 };
                highlightConnections[[23,25].sort((a,b) => a - b).join(',')] = { color: 'purple', lineWidth: 6 };
                highlightConnections[[26,28].sort((a,b) => a - b).join(',')] = { color: 'purple', lineWidth: 6 };
                highlightConnections[[25,27].sort((a,b) => a - b).join(',')] = { color: 'purple', lineWidth: 6 };
            }
        }

        // Display Feedback
        if (assessmentFeedback.length === 0) {
            feedbackElement.innerHTML = '<span class="good">Great Overhead Squat Form! (No compensations detected)</span>';
        } else {
            feedbackElement.innerHTML = '<h3>Compensations Detected:</h3><ul>' +
                assessmentFeedback.map(item => `<li>${item}</li>`).join('') +
                '</ul>';
        }
        
        // --- Visual Cues: Redraw highlighted landmarks/connections ---
        POSE_CONNECTIONS.forEach(connection => {
            const p1 = landmarks[connection[0]];
            const p2 = landmarks[connection[1]];
            const highlightKey = [connection[0], connection[1]].sort((a,b) => a - b).join(',');
            if (highlightConnections[highlightKey] && p1 && p2) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
                canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
                canvasCtx.strokeStyle = highlightConnections[highlightKey].color;
                canvasCtx.lineWidth = highlightConnections[highlightKey].lineWidth;
                canvasCtx.stroke();
            }
        });

        Object.keys(highlightLandmarks).forEach(idx => {
            const landmark = landmarks[idx];
            const highlightProps = highlightLandmarks[idx];
            if (landmark) {
                canvasCtx.beginPath();
                canvasCtx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, highlightProps.radius, 0, 2 * Math.PI);
                canvasCtx.fillStyle = highlightProps.color;
                canvasCtx.fill();
            }
        });


    } else {
        feedbackElement.textContent = 'No pose detected. Make sure you are visible to the camera.';
    }
    canvasCtx.restore();
});

// --- Authentication Functions (placed after global variables/elements) ---
async function handleSignup() {
    const email = emailInput.value;
    const password = passwordInput.value;
    authErrorSpan.textContent = ''; // Clear previous errors
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log('User signed up:', userCredential.user.email);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            email: userCredential.user.email,
            role: 'client',
            createdAt: new Date(),
            lastLogin: new Date()
        });
        feedbackElement.textContent = 'Account created successfully! Welcome.';
    } catch (error) {
        console.error('Signup error:', error.message);
        authErrorSpan.textContent = `Signup failed: ${error.message}`;
    }
}

async function handleLogin() {
    const email = emailInput.value;
    const password = passwordInput.value;
    authErrorSpan.textContent = ''; // Clear previous errors
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('User logged in:', userCredential.user.email);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            lastLogin: new Date()
        }, { merge: true });
        feedbackElement.textContent = 'Logged in successfully! Welcome back.';
    } catch (error) {
        console.error('Login error:', error.message);
        authErrorSpan.textContent = `Login failed: ${error.message}`;
    }
}

function handleLogout() {
    authErrorSpan.textContent = ''; // Clear errors
    signOut(auth).then(() => {
        console.log('User logged out');
        feedbackElement.textContent = 'Logged out.';
        emailInput.value = '';
        passwordInput.value = '';
    }).catch((error) => {
        console.error('Logout error:', error.message);
        authErrorSpan.textContent = `Logout failed: ${error.message}`;
    });
}

// --- Authentication State Observer (Crucial for UI updates) ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    isGuestMode = false; // Not in guest mode if logged in

    userEmailSpan.textContent = user.email;
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';

    startButton.disabled = false;
    resetButton.disabled = false;
    // Save and share buttons become visible/enabled
    if (saveAssessmentButton) saveAssessmentButton.style.display = 'block';
    if (shareAssessmentButton) shareAssessmentButton.style.display = 'block';
    if (guestModePromptElement) guestModePromptElement.style.display = 'none'; // Hide guest prompt

    instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Welcome, ' + user.email + '! Click "Start Assessment" to begin your overhead squat analysis.</p>';
    feedbackElement.textContent = 'Ready to begin.';

  } else {
    isGuestMode = true; // Enable guest mode
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';

    // Enable assessment controls for guest mode
    startButton.disabled = false;
    stopButton.disabled = true; // Stop disabled until started
    resetButton.disabled = false;

    // Hide/disable save and share features for guests
    if (saveAssessmentButton) saveAssessmentButton.style.display = 'none';
    if (shareAssessmentButton) shareAssessmentButton.style.display = 'none';
    // Show guest prompt
    if (guestModePromptElement) {
      guestModePromptElement.style.display = 'block';
      guestModePromptElement.innerHTML = '<p><strong>Guest Mode:</strong> You can try the assessment without logging in. Log in to save your results or share with a trainer.</p>';
    }


    instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Welcome! Try the assessment now, or log in/sign up to save your progress.</p>';
    feedbackElement.textContent = 'Ready to begin (Guest Mode).';
  
    // Stop camera if running and user logs out
    if (isCameraRunning) {
      camera.stop();
      isCameraRunning = false;
    }
  }
});

// --- Control Functions ---

async function startAssessment() {
    // Assessment can start if camera is not running AND (user is logged in OR in guest mode)
    if (!isCameraRunning && (auth.currentUser || isGuestMode)) {
        feedbackElement.textContent = 'Loading MediaPipe Pose model...';
        instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Getting ready... please wait.</p>';
        repCounterElement.textContent = 'Reps: 0';
        
        if (!pose._initialized) {
              await pose.initialize().catch(error => {
                feedbackElement.textContent = 'Error loading MediaPipe Pose model: ' + error.message;
                console.error('MediaPipe Pose initialization error:', error);
                return;
            });
        }
        
        feedbackElement.textContent = 'MediaPipe Pose model loaded. Starting webcam...';

        if (!camera) {
            camera = new Camera(videoElement, {
                onFrame: async () => {
                    if (isCameraRunning) {
                        await pose.send({image: videoElement});
                    }
                },
                width: 640,
                height: 480
            });
        }

        await camera.start();
        isCameraRunning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        resetButton.disabled = false;
        instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Stand facing the camera with your arms extended overhead. Perform your overhead squats.</p>';
    } else if (!auth.currentUser && !isGuestMode) { // Fallback, though onAuthStateChanged should prevent this
        feedbackElement.textContent = 'Please log in or try in guest mode to start an assessment.';
    }
}

function stopAssessment() {
    if (isCameraRunning) {
        camera.stop();
        isCameraRunning = false;
        startButton.disabled = false;
        stopButton.disabled = true;
        feedbackElement.textContent = 'Assessment stopped. Your final rep count was: ' + repCount + '.';
        instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Assessment finished. Click "Start Assessment" to review or "Reset" to clear.</p>';
        
        // For guests, provide a call to action after stopping
        if (isGuestMode && guestModePromptElement) {
            guestModePromptElement.innerHTML = '<p><strong>Assessment Complete!</strong> Log in or sign up now to save your results or share with a trainer.</p>';
            guestModePromptElement.style.display = 'block';
        } else if (!isGuestMode && auth.currentUser) {
            // For logged-in users, show save/share buttons after stopping
            if (saveAssessmentButton) saveAssessmentButton.style.display = 'block';
            if (shareAssessmentButton) shareAssessmentButton.style.display = 'block';
        }
    }
}

function resetAssessment() {
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    feedbackElement.textContent = 'Ready to begin.';
    instructionsElement.innerHTML = '<h2>Instructions:</h2><p>Click "Start Assessment" to begin. Stand facing the camera with your arms extended overhead. Perform an overhead squat while the system analyzes your form. Click "Stop Assessment" when finished.</p>';
    
    repCount = 0;
    squatPhase = 'up';
    repCounterElement.textContent = `Reps: ${repCount}`;

    if(isCameraRunning) {
        camera.stop();
        isCameraRunning = false;
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    resetButton.disabled = true;

    // Reset guest mode prompt or hide save/share buttons appropriately
    if (isGuestMode && guestModePromptElement) {
        guestModePromptElement.innerHTML = '<p><strong>Guest Mode:</strong> You can try the assessment without logging in. Log in to save your results or share with a trainer.</p>';
        guestModePromptElement.style.display = 'block';
    } else if (!isGuestMode && auth.currentUser) {
        if (saveAssessmentButton) saveAssessmentButton.style.display = 'none'; // Hide after reset for logged-in user until new assessment completes
        if (shareAssessmentButton) shareAssessmentButton.style.display = 'none';
    }
}

// --- Event Listeners for Buttons ---
loginButton.addEventListener('click', handleLogin);
signupButton.addEventListener('click', handleSignup);
logoutButton.addEventListener('click', handleLogout);
startButton.addEventListener('click', startAssessment);
stopButton.addEventListener('click', stopAssessment);
resetButton.addEventListener('click', resetAssessment);

// Initial setup on page load
// The onAuthStateChanged will set the initial UI state.
// No direct call to resetAssessment() here as onAuthStateChanged handles it.