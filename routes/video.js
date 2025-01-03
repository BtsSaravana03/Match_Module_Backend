import express from 'express';
import fs from 'fs';
import path from 'path';  // Import path module
import { fileURLToPath } from 'url';

const router = express.Router();

router.get('/getBlobURL/:filepath', async (req, res) => {
    try {
        const filePath = path.resolve(decodeURIComponent(req.params.filepath));

        // Check if the file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        const ext = path.extname(filePath).toLowerCase();

        // Set Content-Type based on file extension
        if (ext === '.m3u8') {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (ext === '.mp4') {
            res.setHeader('Content-Type', 'video/mp4');
        } else {
            return res.status(400).send('Unsupported file type');
        }

        res.setHeader('Content-Disposition', 'inline');

        // Stream the file to the response
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (error) => {
            console.error('Error reading file:', error);
            res.status(500).send('Internal Server Error');
        });

    } catch (err) {
        console.error('Error processing request:', err);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
