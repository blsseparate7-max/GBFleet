import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

async function test() {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (!fs.existsSync(firebaseConfigPath)) {
    console.log("No config file found at", firebaseConfigPath);
    return;
  }
  const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
  console.log("Config loaded:", config);

  const appInstance = admin.initializeApp({
    projectId: config.projectId,
  });

  // Test 1: with configured database ID (gbfleet)
  console.log("\n--- TEST 1: Configured database ID (gbfleet) ---");
  try {
    const dbGbfleet = getFirestore(appInstance, "gbfleet");
    const collections = await dbGbfleet.listCollections();
    console.log("Success listing collections in gbfleet database! Collections count:", collections.length);
  } catch (e: any) {
    console.error("Test 1 failed:", e.message || e);
  }

  // Test 2: with (default) database ID
  console.log("\n--- TEST 2: Default database ID ---");
  try {
    const dbDefault = getFirestore(appInstance, "(default)");
    const collections = await dbDefault.listCollections();
    console.log("Success listing collections in (default) database! Collections count:", collections.length);
    for (const coll of collections) {
      console.log("- Collection ID:", coll.id);
    }
  } catch (e: any) {
    console.error("Test 2 failed:", e.message || e);
  }

  // Test 3: check if we can write/read a test doc in (default) database
  console.log("\n--- TEST 3: Attempt write/read to (default) database ---");
  try {
    const dbDefault = getFirestore(appInstance, "(default)");
    const docRef = dbDefault.collection("system_state").doc("gbfleet_db");
    const docSnap = await docRef.get();
    console.log("Document gbfleet_db in (default) exists?", docSnap.exists);
    if (docSnap.exists) {
      console.log("Keys in doc:", Object.keys(docSnap.data() || {}));
    }
  } catch (e: any) {
    console.error("Test 3 failed:", e.message || e);
  }
}

test().catch(console.error);
