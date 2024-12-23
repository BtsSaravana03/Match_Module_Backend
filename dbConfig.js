import sqlite3 from 'sqlite3';

const dbPath = './SQLite DB/Cricket';
console.log('DB Path: '+ dbPath);
const db = new (sqlite3.verbose()).Database(dbPath);
//const db = new (sqlite3.verbose()).Database('./Jukebox/VenueScoringNov_11/DB/Cricket');

export default db;
