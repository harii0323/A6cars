const { MongoClient, ServerApiVersion } = require("mongodb");

const DEFAULT_MONGODB_URI =
  "mongodb+srv://A6cars:Anu@a6cars.muz7zpm.mongodb.net/?appName=A6cars";

const mongoUri = (process.env.MONGODB_URI || DEFAULT_MONGODB_URI).trim();
const dbName =
  process.env.MONGODB_DB_NAME ||
  (() => {
    try {
      const parsed = new URL(mongoUri);
      const pathname = parsed.pathname.replace(/^\/+/, "").trim();
      return pathname || "a6cars";
    } catch (error) {
      return "a6cars";
    }
  })();

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let dbInstance;

async function connectMongo() {
  if (dbInstance) {
    return dbInstance;
  }

  await client.connect();
  dbInstance = client.db(dbName);

  await dbInstance.command({ ping: 1 });
  console.log(`✅ MongoDB connected successfully (${dbName})`);

  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    throw new Error("MongoDB is not connected yet.");
  }

  return dbInstance;
}

async function closeMongo() {
  await client.close();
  dbInstance = undefined;
}

module.exports = {
  client,
  closeMongo,
  connectMongo,
  dbName,
  getDb,
  mongoUri,
};
