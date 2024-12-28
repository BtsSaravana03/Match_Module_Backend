import express from 'express';
import db from '../dbConfig.js';
import { getData } from '../Master_fn/Master.js';
const router = express.Router();

router.get('/getCompetitions', async (req, res) => {
    let q = `SELECT * FROM COMPETITIONS`;
    try {
        let result = await new Promise((resolve, reject) => {
            db.all(q, [], (err, rows) => {
                if (err) {
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        });
        res.send(result);
    } catch (err) {
        console.error("Error fetching competitions:", err);
        res.status(500).send("Error fetching competitions");
    }
});

router.get('/getMatches/:compid',async (req,res)=>{
    try{
        let q = `
		SELECT
    M.ID AS ID,
    M.COMPETITIONID AS COMP_ID,
    CA.CLUBNAME AS ClubA,
    CB.CLUBNAME AS ClubB,
    CA.CLUBNAME || ' v ' || CB.CLUBNAME AS MatchName,
    M.Date,
    CA.CLUBNAME || ' v ' || CB.CLUBNAME || ' - ' ||
    SUBSTR(M.Date, 9, 2) || '/' ||
    SUBSTR(M.Date, 6, 2) || '/' ||
    SUBSTR(M.Date, 1, 4) || ', ' ||
    SUBSTR(M.Date, 12, 5) AS MatchNameDate,
    INNINGSCOUNT AS InningsCount,
    KNOCKOUT AS KnockOut
    FROM
        MATCH M
        JOIN CLUB CA ON CA.CLUBID = M.CLUBA
        JOIN CLUB CB ON CB.CLUBID = M.CLUBB
    WHERE
        M.COMPETITIONID = ?;
	`;
        let result = await new Promise((resolve,reject)=>{
            db.all(q,[req.params.compid],(err,rows)=>{
                if(err){
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        })
        res.send(result);
    }catch(err){
        console.error("Error Fetching Matches:", err);
        res.status(500).send("Error Fetching Matches");
    }
});
router.get('/getMatchDetails/:matchid',async(req,res)=>{
    try{
        let q = `SELECT M.*,
       CA.PREFIX || ' v ' || CB.PREFIX AS MatchNameShort,
       CA.PREFIX || ' Vs ' || CB.PREFIX AS MtcVideos,
       CA.CLUBNAME || ' v ' || CB.CLUBNAME AS MatchName,
	   MT.isLimitedOvers,
        CA.PREFIX as ClubAPrefix,
        CB.PREFIX as ClubBPrefix,
        CA.ClubName as ClubAFull,
        CB.ClubName as ClubBFull,
        S.NAME AS StadiumName,
        S.City AS City,
        C.Name AS CompFullName,
        C.CompPrefix,
       MT.InnCount
        FROM MATCH M
        JOIN CLUB CA ON CA.CLUBID = M.CLUBA
        JOIN CLUB CB ON CB.CLUBID = M.CLUBB
        JOIN MATCHTYPE MT ON MT.ID = M.MATCHTYPEID
        JOIN COMPETITIONS C ON C.ID = M.CompetitionID
        LEFT JOIN STADIUM S ON S.ID = M.STADIUMID
        WHERE M.ID = ?;`;

        let i = `SELECT I.*,CBT.ClubName as BattingClubName,CBT.Prefix as BattingClubPrefix,CBO.ClubName as BowlingClubName,CBO.Prefix as BowlingClubPrefix FROM INNINGS I
		LEFT JOIN CLUB CBT ON CBT.CLUBID = I.BATTINGCLUBID
		LEFT JOIN CLUB CBO ON CBO.CLUBID = I.BOWLINGCLUBID
		WHERE I.MATCHID=?`;

        let r = `SELECT MR.*,C.CLUBNAME as ClubName,C.PREFIX AS ClubPrefix FROM MATCHRESULT MR
        LEFT JOIN CLUB C ON C.clubid=MR.CLUBID
        WHERE MR.MATCHID=?`

        let info = `SELECT C.Name as Series
        ,C.Season
        ,CA.ClubName || ' v ' || CB.ClubName AS MatchName
        ,S.Name AS Venue
        ,S.City as City
        ,strftime('%H:%M', Date) || ' IST' AS Time
        ,strftime('%Y-%m-%d', Date) AS Date
        ,MatchOvers
        ,MT.Description as Format
        ,TWC.ClubName || ', elected to ' ||case when I.Description='Batting' then 'bat' when I.Description='Fielding' then 'field' end || ' first'  as Toss
        ,O1.FirstName || ' ' || O1.LastName ||', '|| O2.FirstName || ' ' || O2.LastName AS [Umpires]
        ,TVO.FirstName || ' ' || TVO.LastName AS [TV Umpire]
        ,Mref.FirstName || ' ' || Mref.LastName AS [Match Refree]
        FROM Match M
        Left join Stadium S on S.ID=M.StadiumId
        Left join Competitions C on C.ID=M.CompetitionId
        Left join MatchType MT on MT.ID=M.MatchTypeID
        Left join Club CA on CA.Clubid=M.ClubA
        Left join Club CB on CB.Clubid=M.ClubB
        Left join Innings I on I.Matchid=M.Id and  Tosswin=1
        Left join Club TWC on TWC.Clubid=I.WinTeam
        Left join MatchOfficials MO on MO.MatchId=M.Id
        Left join Officials O1 on O1.Id=MO.Official1Id
        Left join Officials O2 on O2.Id=MO.Official2Id
        Left join Officials Mref on Mref.Id=MO.MatchRefId
        Left join Officials TVO on TVO.Id=MO.TVUmpireId
        WHERE M.ID = ?`
        let result = [];
        let matchResponse = await getData(q,[req.params.matchid]);
        if(matchResponse?.data?.length>0){
            let inningsResponse = await getData(i,[req.params.matchid]);
            matchResponse.data[0].inningsData = inningsResponse.data||null;
            let matchResult = await getData(r, [req.params.matchid]);
            matchResponse.data[0].result = matchResult.data || null;
            matchResponse.data[0].MatchComplete = matchResult.data.length > 0 ? true : false;
            let matchInfo = await getData(info, [req.params.matchid]);
            matchResponse.data[0].info = matchInfo.data[0] || null;
            result = matchResponse.data;
        }
        res.send(result);
    }
    catch(err){
        console.error("Error Fetching MatchDetails:", err);
        res.status(500).send("Error Fetching MatchDetails");
    }
});
router.get('/getDismissalTypeMaster',async(req,res)=>{
    try{
        let q = `SELECT * FROM DismissalType`;
        let result = await new Promise((resolve,reject)=>{
            db.all(q,[req.params.matchid],(err,rows)=>{
                if(err){
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        })
        res.send(result);
    }
    catch(err){
        console.error("Error Fetching DismissalType:", err);
        res.status(500).send("Error Fetching DismissalType");
    }
});
router.get('/getBowlingTypes',async(req,res)=>{
    try{
        let q = `SELECT * FROM BOWLINGTYPE`;
        let result = await new Promise((resolve,reject)=>{
            db.all(q,[],(err,rows)=>{
                if(err){
                    res.status(500);
                    reject(err);
                }
                res.status(200);
                resolve(rows);
            })
        })
        res.send(result);
    }
    catch(error){
        console.error("Error Fetching BowlingTypes:", err);
        res.status(500).send("Error Fetching BowlingTypes");
    }
});

export default router;
