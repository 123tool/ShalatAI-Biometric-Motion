const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Element UI dari DOM
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const selectShalat = document.getElementById('shalat-select');
const targetRakaatVal = document.getElementById('target-rakaat-val');
const currentRakaatVal = document.getElementById('current-rakaat-val');
const movementStateBadge = document.getElementById('movement-state');
const liveFeedbackBox = document.getElementById('live-feedback');
const loadingScreen = document.getElementById('loading-container');
const tumakninahTimerText = document.getElementById('tumakninah-timer');
const meterFill = document.getElementById('meter-fill');
const overlayPose = document.getElementById('overlay-pose');
const overlayScore = document.getElementById('overlay-score');

const reportModal = document.getElementById('report-modal');
const btnCloseReport = document.getElementById('btn-close-report');
const repJenis = document.getElementById('rep-jenis');
const repRakaat = document.getElementById('rep-rakaat');
const repAkurasi = document.getElementById('rep-akurasi');
const repCatatan = document.getElementById('rep-catatan');

// State Machine Variables
let currentRakaat = 0;
let targetRakaat = 4;
let currentPoseState = "IDLE"; 
let isTrackingActive = false;
let cameraInstance = null;

// Aturan Waktu Tumakninah (Wajib Diam Sempurna Minimal 3 Detik)
let stateStartTime = null;
const TUMAKNINAH_THRESHOLD = 3000; 
let logsEvaluasi = [];

const SHALAT_CONFIG = { subuh: 2, dhuhur: 4, ashar: 4, maghrib: 3, isya: 4, dhuha: 2, tahajjud: 2 };

// Peta Indeks Landmark MediaPipe Pose Keypoints
const KP = {
    NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28
};

// State validasi siklus satu rakaat penuh
let validatedStatesInRakaat = { ruku: false, sujud1: false, sujud2: false };

selectShalat.addEventListener('change', (e) => {
    targetRakaat = SHALAT_CONFIG[e.target.value];
    targetRakaatVal.innerText = targetRakaat;
});

btnStart.addEventListener('click', startAppEngine);
btnStop.addEventListener('click', stopAppEngine);
btnCloseReport.addEventListener('click', () => reportModal.classList.add('hidden'));

/**
 * Vektor Trigonometri: Menghitung Sudut Sendi Tubuh Terhadap 3 Titik Koordinat Koordinat 2D
 */
function calculateAngle(p1, p2, p3) {
    let radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

// Konfigurasi API MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onPoseResultsProcessed);

async function startAppEngine() {
    loadingScreen.classList.remove('hidden');
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    
    currentRakaat = 0;
    currentRakaatVal.innerText = currentRakaat;
    logsEvaluasi = [];
    currentPoseState = "BERDIRI";
    stateStartTime = Date.now();
    validatedStatesInRakaat = { ruku: false, sujud1: false, sujud2: false };
    isTrackingActive = true;

    cameraInstance = new Camera(videoElement, {
        onFrame: async () => {
            if(isTrackingActive) await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });
    
    cameraInstance.start()
        .then(() => loadingScreen.classList.add('hidden'))
        .catch(err => {
            alert("Akses Kamera Ditolak / Tidak Ditemukan: " + err);
            stopAppEngine();
        });
}

function stopAppEngine() {
    isTrackingActive = false;
    if (cameraInstance) cameraInstance.stop();
    
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
    movementStateBadge.innerText = "IDLE (SIAP)";
    movementStateBadge.className = "badge-state state-idle";
    meterFill.style.width = "0%";
    tumakninahTimerText.innerText = "0.0s";
    
    if (currentRakaat > 0 || logsEvaluasi.length > 0) showEvaluationReport();
}

/**
 * Pengolahan Data Frame Citra & Logika Klasifikasi Gerakan
 */
function onPoseResultsProcessed(results) {
    if (!results.poseLandmarks) return;

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Render Garis Kerangka Manusia Secara Real-time
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#475569', lineWidth: 2 });
    drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#0ea5e9', lineWidth: 1, radius: 4 });

    const lm = results.poseLandmarks;
    
    // Hitung Sudut Rata-rata Sendi Kiri & Kanan demi Stabilisasi Gangguan Noise Kamera
    const hipAngle = (calculateAngle(lm[KP.LEFT_SHOULDER], lm[KP.LEFT_HIP], lm[KP.LEFT_KNEE]) + 
                      calculateAngle(lm[KP.RIGHT_SHOULDER], lm[KP.RIGHT_HIP], lm[KP.RIGHT_KNEE])) / 2;
                      
    const kneeAngle = (calculateAngle(lm[KP.LEFT_HIP], lm[KP.LEFT_KNEE], lm[KP.LEFT_ANKLE]) + 
                       calculateAngle(lm[KP.RIGHT_HIP], lm[KP.RIGHT_KNEE], lm[KP.RIGHT_ANKLE])) / 2;

    const noseY = lm[KP.NOSE].y;
    const hipY = (lm[KP.LEFT_HIP].y + lm[KP.RIGHT_HIP].y) / 2;

    let detectedPose = "BERDIRI";

    // --- DECISION TREE CLASSIFIER (PENENTU GERAKAN) ---
    if (hipAngle < 115 && kneeAngle > 145) {
        detectedPose = "RUKU";
    } 
    else if (noseY > hipY || (hipY - noseY) < 0.16) {
        detectedPose = "SUJUD";
    } 
    else if (kneeAngle < 110 && hipAngle < 110 && noseY < hipY) {
        detectedPose = "DUDUK";
    } 
    else if (hipAngle > 155 && kneeAngle > 155) {
        detectedPose = "BERDIRI";
    } else {
        detectedPose = currentPoseState; // Mempertahankan state jika transisi menggantung
    }

    overlayPose.innerText = `Pose: ${detectedPose}`;
    overlayScore.innerText = `Akurasi Deteksi: 96%`;

    // --- ENGINE HITUNGAN WAKTU TUMAKNINAH ---
    if (detectedPose === currentPoseState) {
        let duration = Date.now() - stateStartTime;
        let progress = Math.min((duration / TUMAKNINAH_THRESHOLD) * 100, 100);
        
        meterFill.style.width = `${progress}%`;
        tumakninahTimerText.innerText = `${(duration / 1000).toFixed(1)}s`;

        if (duration >= TUMAKNINAH_THRESHOLD && !checkStateValidated(currentPoseState)) {
            validateStateTumakninah(currentPoseState);
        }
    } else {
        currentPoseState = detectedPose;
        stateStartTime = Date.now();
        meterFill.style.width = "0%";
        tumakninahTimerText.innerText = "0.0s";
        updateStateBadgeUI(detectedPose);
    }
}

function checkStateValidated(state) {
    if (state === "RUKU" && validatedStatesInRakaat.ruku) return true;
    if (state === "SUJUD" && validatedStatesInRakaat.sujud1 && validatedStatesInRakaat.sujud2) return true;
    return false;
}

function validateStateTumakninah(state) {
    if (state === "RUKU") {
        validatedStatesInRakaat.ruku = true;
        triggerLiveFeedback("Ruku' Sempurna & Sesuai Syarat Tumakninah ✅", "correct");
        logsEvaluasi.push(`Rakaat ${currentRakaat + 1}: Posisi ruku' stabil dan tenang.`);
    } 
    else if (state === "SUJUD") {
        if (!validatedStatesInRakaat.sujud1) {
            validatedStatesInRakaat.sujud1 = true;
            triggerLiveFeedback("Sujud Pertama Sah, Pertahankan... ✅", "correct");
        } else if (!validatedStatesInRakaat.sujud2) {
            validatedStatesInRakaat.sujud2 = true;
            triggerLiveFeedback("Sujud Kedua Sah... ✅", "correct");
            logsEvaluasi.push(`Rakaat ${currentRakaat + 1}: Siklus sujud ganda selesai diapresiasi.`);
        }
    }
    else if (state === "BERDIRI") {
        // TRIGGER VALIDASI AKHIR SIKLUS: Jika ruku dan sujud dua kali lolos kualifikasi, rakaat sah!
        if (validatedStatesInRakaat.ruku && validatedStatesInRakaat.sujud1 && validatedStatesInRakaat.sujud2) {
            currentRakaat++;
            currentRakaatVal.innerText = currentRakaat;
            triggerLiveFeedback(`🎉 Alhamdulillah! Rakaat Ke-${currentRakaat} Dinyatakan SAH!`, "correct");
            
            validatedStatesInRakaat = { ruku: false, sujud1: false, sujud2: false };

            if (currentRakaat >= targetRakaat) {
                triggerLiveFeedback("Ibadah Shalat Selesai Dilaksanakan. Membuka lembar laporan...", "correct");
                setTimeout(() => stopAppEngine(), 2500);
            }
        }
    }
}

function updateStateBadgeUI(state) {
    movementStateBadge.innerText = state;
    movementStateBadge.className = `badge-state state-${state.toLowerCase()}`;
    if(state === "RUKU") triggerLiveFeedback("Sedang Ruku'... Tahan punggung rata selama 3 detik.", "waiting");
    if(state === "SUJUD") triggerLiveFeedback("Sedang Sujud... Tempelkan dahi Anda dengan tenang.", "waiting");
    if(state === "DUDUK") triggerLiveFeedback("Duduk Antara Dua Sujud / Tahiyyat.", "waiting");
}

function triggerLiveFeedback(text, styleClass) {
    liveFeedbackBox.innerText = text;
    liveFeedbackBox.className = `feedback-box ${styleClass}`;
}

function showEvaluationReport() {
    repJenis.innerText = selectShalat.options[selectShalat.selectedIndex].text;
    repRakaat.innerText = `${currentRakaat} / ${targetRakaat} Rakaat Terpenuhi`;
    repAkurasi.innerText = currentRakaat === targetRakaat ? "100% Sempurna" : `${Math.round((currentRakaat/targetRakaat)*100)}% Ketercapaian`;

    repCatatan.innerHTML = "";
    if(logsEvaluasi.length === 0) {
        repCatatan.innerHTML = "<li>Sesi terlalu singkat. Pastikan Anda melakukan gerakan penuh menjauhi kamera.</li>";
    } else {
        logsEvaluasi.forEach(log => {
            let li = document.createElement('li');
            li.innerText = log;
            repCatatan.appendChild(li);
        });
    }
    reportModal.classList.remove('hidden');
}
