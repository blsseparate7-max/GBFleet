async function run() {
  const url = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0831890855/databases/ai-studio-2021bb5c-0c47-4834-b43b-47bc171dd353/documents/system_state/gbfleet_db?key=AIzaSyDdgR9pO-H7Kog_0NDfTH-Fhk0AUwLaVPc";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log("Error status:", res.status);
      return;
    }
    const data = await res.json();
    
    function fromFirestoreValue(val) {
      if (!val) return null;
      if ("nullValue" in val) return null;
      if ("booleanValue" in val) return val.booleanValue;
      if ("integerValue" in val) return parseInt(val.integerValue, 10);
      if ("doubleValue" in val) return Number(val.doubleValue);
      if ("stringValue" in val) return val.stringValue;
      if ("arrayValue" in val) {
        const values = val.arrayValue?.values || [];
        return values.map(fromFirestoreValue);
      }
      if ("mapValue" in val) {
        const fields = val.mapValue?.fields || {};
        const resObj = {};
        for (const key of Object.keys(fields)) {
          resObj[key] = fromFirestoreValue(fields[key]);
        }
        return resObj;
      }
      return null;
    }

    const fields = data.fields || {};
    const dbData = {};
    for (const key of Object.keys(fields)) {
      dbData[key] = fromFirestoreValue(fields[key]);
    }

    console.log("=== COMPANIES ===");
    console.log(JSON.stringify(dbData.companies, null, 2));

    console.log("\n=== USERS ===");
    console.log(JSON.stringify(dbData.users, null, 2));
  } catch (err) {
    console.error(err);
  }
}
run();
