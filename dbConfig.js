import sqlite3 from 'sqlite3';

const dbPath = './SQLite DB/Cricket';
// const dbPath = '../../Program Files (x86)/Kadamba/Jukebox_Venue_Setup/DB/Cricket';
console.log('DB Path: '+ dbPath);
const db = new (sqlite3.verbose()).Database(dbPath);

export default db;
