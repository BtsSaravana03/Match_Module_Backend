import express from 'express';
import homeRoute from './routes/home.js';
import ballbyballRoute from './routes/ballByBall.js';
import loginRoute from './routes/login.js';
import cors from 'cors';

const app = express()
const port = process.env.PORT ||3000;
app.use(cors());
app.use(express.static('MatchVideos'));

//ROUTES
app.use('/home',homeRoute);
app.use('/ballbyball',ballbyballRoute);
app.use('/login', loginRoute);

app.get('/', (req, res) => {
    return res.send('Match-Module Working');
})

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`)
});