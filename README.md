## ShalatAI Biometric Motion Analyzer

Aplikasi berbasis web mutakhir (*Advanced Web-Based AI Application*) yang memanfaatkan kamera perangkat (*computer vision*) untuk menganalisis gerakan fisik, menghitung sudut biomekanis sendi tubuh secara real-time, dan mengesahkan tahapan rukun shalat berdasarkan asas ketenangan gerakan (**Tumakninah**) serta ketepatan sudut sunnah ibadah.

---

## 🚀 Fitur

*   **Real-time Biometric Core:** Memanfaatkan integrasi *Google MediaPipe Pose Engine* via CDN untuk membaca dan melacak 33 titik koordinat rangka tubuh manusia ($XYZ$) secara instan dan presisi.
*   **Logika Sunnah & Trigonometri Presisi:** Menghitung sudut lengkung punggung (*hip angle*) dan kelurusan lutut (*knee angle*) menggunakan perhitungan vektor matematika hukum kosinus secara langsung.
*   **Mekanisme Kunci Tumakninah (Anti-Cheat Timer):** Mengunci transisi state gerakan dengan *timer* ketat (`TUMAKNINAH_THRESHOLD = 3000ms`). Jika pengguna berpindah posisi terlalu cepat sebelum 3 detik, rakaat tidak akan dianggap sah.
*   **State Machine Berantai Otomatis:** Mengamankan siklus perpindahan rukun fisik secara tertib (Berdiri $\rightarrow$ Ruku' $\rightarrow$ I'tidal $\rightarrow$ Sujud 1 $\rightarrow$ Duduk $\rightarrow$ Sujud 2 $\rightarrow$ Bangkit Berdiri).
*   **AI Voice Feedback (Audio Text-to-Speech):** Memanfaatkan *Web Speech API* untuk memberikan asisten suara koreksi langsung secara interaktif saat arah atau sudut gerakan terdeteksi kurang sempurna.
*   **Jurnal Rapor Sesi (LocalDB Persistence):** Menyimpan ringkasan kualitas ibadah, persentase akurasi gerakan, dan daftar catatan koreksi evaluasi
  
---
