import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (!fs.existsSync(configPath)) {
  console.error("Config file not found!");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function check() {
  const docRef = doc(db, "system_state", "gbfleet_db");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    console.log("=== COMPANIES ===");
    console.log(JSON.stringify(data.companies || [], null, 2));

    console.log("=== USERS ===");
    console.log(JSON.stringify(data.users || [], null, 2));
    
    // Find any mentions of "boi" or "barão" or "barao" in the entire document
    const text = JSON.stringify(data);
    console.log("=== SEARCHING FOR BOI / BARAO / BARÃO ===");
    const matches: string[] = [];
    
    // Check drivers, freights, trucks, routes, etc.
    if (data.drivers) {
      data.drivers.forEach((d: any) => {
        if (JSON.stringify(d).toLowerCase().includes("boi") || JSON.stringify(d).toLowerCase().includes("bar")) {
          matches.push(`Driver: ${JSON.stringify(d)}`);
        }
      });
    }
    if (data.companies) {
      data.companies.forEach((c: any) => {
        if (JSON.stringify(c).toLowerCase().includes("boi") || JSON.stringify(c).toLowerCase().includes("bar")) {
          matches.push(`Company: ${JSON.stringify(c)}`);
        }
      });
    }
    if (data.users) {
      data.users.forEach((u: any) => {
        if (JSON.stringify(u).toLowerCase().includes("boi") || JSON.stringify(u).toLowerCase().includes("bar")) {
          matches.push(`User: ${JSON.stringify(u)}`);
        }
      });
    }
    if (data.trucks) {
      data.trucks.forEach((t: any) => {
        if (JSON.stringify(t).toLowerCase().includes("boi") || JSON.stringify(t).toLowerCase().includes("bar")) {
          matches.push(`Truck: ${JSON.stringify(t)}`);
        }
      });
    }
    if (data.freights) {
      data.freights.forEach((f: any) => {
        if (JSON.stringify(f).toLowerCase().includes("boi") || JSON.stringify(f).toLowerCase().includes("bar")) {
          matches.push(`Freight: ${JSON.stringify(f)}`);
        }
      });
    }
    
    console.log("Matches found:", matches.length);
    matches.forEach(m => console.log(m));
  } else {
    console.log("Remote document gbfleet_db does not exist.");
  }
}

check().catch(console.error);
