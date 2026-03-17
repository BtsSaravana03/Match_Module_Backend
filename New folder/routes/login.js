import express from 'express';
import db from '../dbConfig.js';
import crypto from 'crypto';
const router = express.Router();

router.post('/validate/:username/:password',async (req, res) => {
    try {
        let q = `SELECT * FROM LoginUser where username=? and password=?`;
        let result = await new Promise((resolve, reject) => {
            db.all(q, [req.params.username, req.params.password], (err, rows) => {
                if (err) {
                    reject({status:500,data:[]});
                }
                let session = crypto.randomBytes(16).toString('base64');
                resolve({ status: 200, data: rows,session:session });
            })
        });
        res.send(result);
    }
    catch (err) {
        throw new Error(err);
    }
})
export default router;
