import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFCpGSUZspU-BKDFqM6zz87914CXKCp4E",
  authDomain: "maishthondepu-weekly-pulse.firebaseapp.com",
  projectId: "maishthondepu-weekly-pulse",
  storageBucket: "maishthondepu-weekly-pulse.firebasestorage.app",
  messagingSenderId: "534663363514",
  appId: "1:534663363514:web:446daf4f83b862da87bb83",
  measurementId: "G-RLCM90CN6T"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const saveMonthData = async (monthKey, data) => {
  try {
    await setDoc(doc(db, "weekly-pulse", monthKey), data);
  } catch (e) {
    console.error("Error saving:", e);
  }
};

export const loadMonthData = async (monthKey) => {
  try {
    const snap = await getDoc(doc(db, "weekly-pulse", monthKey));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("Error loading:", e);
    return null;
  }
};
