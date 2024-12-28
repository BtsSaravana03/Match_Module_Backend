import express from 'express';
import db from '../dbConfig.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
const router = express.Router();

router.get('/getBlobURL/:filepath/:videoMode', async (req, res) => {
    try {
        const videoPath = "file:///" + req.params.filepath;
        const filePath = fileURLToPath(videoPath);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        const videoMode = parseInt(req.params.videoMode, 10);
        const ext = path.extname(filePath).toLowerCase();

        if (videoMode === 3 && ext !== '.m3u8') {
            return res.status(400).send('Invalid file type for videoMode 3');
        }

        if (videoMode === 3) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (ext === '.mp4') {
            res.setHeader('Content-Type', 'video/mp4');
        } else {
            return res.status(400).send('Unsupported file type');
        }
        res.setHeader('Content-Disposition', 'inline');

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (error) => {
            console.error('Error reading video file:', error);
            res.status(500).send('Internal Server Error');
        });
        
    } catch (err) {
        res.send(err);
    }
});

export default router;
