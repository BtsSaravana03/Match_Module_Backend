import express from 'express';
import homeRoute from './routes/home.js';
import ballbyballRoute from './routes/ballByBall.js';
import loginRoute from './routes/login.js';
import videoRoute from './routes/video.js';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
var hostname = os.hostname();

dotenv.config();
const app = express()
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.static('MatchVideos'));

//ROUTES
app.use('/home',homeRoute);
app.use('/ballbyball',ballbyballRoute);
app.use('/login', loginRoute);
app.use('/video', videoRoute);

app.get('/', (req, res) => {
    return res.send({status:true,hostname:hostname});
})

app.listen(port, () => {
    console.log(`Server listening at http://${hostname}:${port}`)
});
