// ============================================
// 1. IMPORTAR FIREBASE
// ============================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";


// ============================================
// 2. CONFIGURACIÓN DEL PROYECTO
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyD_hz2Y0qajgRMPeb0L3Ky75jQJIebywJM",

  authDomain: "red-de-patas.firebaseapp.com",

  projectId: "red-de-patas",

  storageBucket: "red-de-patas.firebasestorage.app",

  messagingSenderId: "812893065625",

  appId: "1:812893065625:web:08b1c067911872edd14308",

  measurementId: "G-M1NH2DJF29"
};


// ============================================
// 3. INICIALIZAR FIREBASE
// ============================================

const app = initializeApp(firebaseConfig);


// ============================================
// 4. PREPARAR SERVICIOS
// ============================================

// Consultar registros y escuchar cambios en tiempo real.
const db = getFirestore(app);

// Consultar las fotografías de las licencias.
const storage = getStorage(app);

// Autenticación para el acceso al panel.
const auth = getAuth(app);


// ============================================
// 5. EXPORTAR SERVICIOS
// ============================================

export {
  app,
  db,
  storage,
  auth
};