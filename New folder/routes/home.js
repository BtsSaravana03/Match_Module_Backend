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
    CA.Prefix AS ClubAPrefix,
    CB.Prefix AS ClubBPrefix,
    CA.CLUBNAME || ' v ' || CB.CLUBNAME AS MatchName,
    CA.Prefix || ' v ' || CB.Prefix AS MatchNameShort,
    M.Date,
    CA.CLUBNAME || ' v ' || CB.CLUBNAME || ' - ' ||
    SUBSTR(M.Date, 9, 2) || '/' ||
    SUBSTR(M.Date, 6, 2) || '/' ||
    SUBSTR(M.Date, 1, 4) || ', ' ||
    SUBSTR(M.Date, 12, 5) AS MatchNameDate,
    CA.Prefix || ' v ' || CB.Prefix || ' - ' ||
    SUBSTR(M.Date, 9, 2) || '/' ||
    SUBSTR(M.Date, 6, 2) || '/' ||
    SUBSTR(M.Date, 1, 4) || ', ' ||
    SUBSTR(M.Date, 12, 5) AS MatchNameDateShort,
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
       MT.InnCount,
       P.FullName AS MomPlayerName
        FROM MATCH M
        JOIN CLUB CA ON CA.CLUBID = M.CLUBA
        JOIN CLUB CB ON CB.CLUBID = M.CLUBB
        JOIN MATCHTYPE MT ON MT.ID = M.MATCHTYPEID
        JOIN COMPETITIONS C ON C.ID = M.CompetitionID
        LEFT JOIN STADIUM S ON S.ID = M.STADIUMID
        LEFT JOIN PLAYERS P ON P.PlayerID = M.MoM
        WHERE M.ID = ?;`;

        let i = `SELECT I.*,CBT.ClubName as BattingClubName,CBT.Prefix as BattingClubPrefix,CBO.ClubName as BowlingClubName,CBO.Prefix as BowlingClubPrefix FROM INNINGS I
		LEFT JOIN CLUB CBT ON CBT.CLUBID = I.BATTINGCLUBID
		LEFT JOIN CLUB CBO ON CBO.CLUBID = I.BOWLINGCLUBID
		WHERE I.MATCHID=? order by inningsid`;

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

router.get('/getSpellWise/:matchid/:inningsid',async(req,res)=>{
    try{
        let q = `WITH ConsecutiveOvers AS (
        SELECT MatchID,InningsID,
            BowlerId,
            Overid,
            LAG(Overid, 1, Overid - 1) OVER (PARTITION BY BowlerId ORDER BY Overid) AS PrevOverid
        FROM ScoreCard where MatchID=${req.params.matchid} and InningsID=${req.params.inningsid} GROUP by MatchID,InningsID,BowlerID,OverID
    ),
    SpellGroups AS (
        SELECT MatchID,InningsID,
            BowlerId,
            Overid,
            CASE WHEN Overid = PrevOverid + 2 THEN 0 ELSE 1 END AS IsNewSpell
        FROM ConsecutiveOvers
    ),  SpellNumbers AS (
        SELECT MatchID,InningsID,
            BowlerId,
            Overid,
            SUM(IsNewSpell) OVER (PARTITION BY BowlerId ORDER BY Overid ROWS UNBOUNDED PRECEDING) AS Spell
        FROM SpellGroups
    )
        SELECT
             MAX(V.PlayerName) AS PlayerName
           ,DENSE_RANK() OVER (PARTITION BY S.BowlerId ORDER BY Spell) AS Spell
            ,COUNT(S.OverID) as Overs
            ,STRING_AGG(S.Overid, ',') AS OversList
            ,SUM(CASE WHEN (bowlruns = 0 AND endover = 1 AND (bowlballs IN (5, 6, 7))) THEN 1 ELSE 0 END) AS Maiden
            ,SUM(V.Runs) AS Runs
            ,CAST(COALESCE(SUM([4s]), 0) AS TEXT) || '/' || CAST(COALESCE(SUM([6s]), 0) AS TEXT) AS "4s/6s",sum(TeamWkts)Wickets
            ,ROUND(SUM(runs) * 1.0 / SUM(TotBalls) * 6, 1) AS Econ,
			CAST (ROUND(SUM(BatSubject) * 100.0 / SUM(bowlballs), 1) AS TEXT) || ' %' AS [LeftAlone%]
        FROM SpellNumbers S
		Left join (
    SELECT
        A.BowlerID,
        MatchID,
        InningsID,
        PlayerName,
        A.OverID,
        SUM(TotBalls) AS TotBalls,
        SUM(Runs + Extras + Penalty + BLExtras) AS Runs,
        COALESCE(SUM(CASE WHEN runs = 4 THEN 1 ELSE 0 END), 0) AS "4s",
        COALESCE(SUM(CASE WHEN runs = 6 THEN 1 ELSE 0 END), 0) AS "6s",
        SUM(Wkt) AS Wickets,
        SUM(DotBalls) AS DotBall,
        SUM(NoBall) AS NoBall,
        SUM(Wide) AS Wide,
        --AVG(CASE WHEN A.BowlSpeed > 0 THEN A.BowlSpeed END) AS BowlSpeed,
        SUM(A.bowlballs) AS BowlBalls,
        SUM(BowlRuns) AS BowlRuns,
        MAX(A.Endover) AS Endover,
        sum(TeamWkts) as TeamWkts,
		sum(CASE WHEN BatSubject = 3 then 1 ELSE 0 END) as BatSubject
    FROM (
        SELECT
            MatchID,
            InningsID,
            BowlerID AS BowlerID,
            FullName AS PlayerName,
            Endover,
            OverID,
            CASE WHEN Extratypeid NOT IN (3, 4, 7) AND runs + extras = 0 THEN 1 ELSE 0 END AS DotBalls,
            CASE WHEN Extratypeid NOT IN (3, 4) THEN runs ELSE 0 END AS Runs,
            CASE WHEN Extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END AS TotBalls,
            CASE WHEN Dismissaltypeid NOT IN (7, 4) THEN 1 ELSE 0 END AS Wkt,
            CASE WHEN Extratypeid IN (1, 5) THEN 1 ELSE 0 END AS Noball,
            CASE WHEN Extratypeid IN (2) THEN 1 ELSE 0 END AS Wide,
            CASE WHEN Extratypeid NOT IN (3, 4, 7) THEN Extras ELSE 0 END AS Extras,
            CASE WHEN Extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END AS Bowlballs,
            runs + CASE WHEN Extratypeid IN (1, 2, 5) THEN Extras ELSE 0 END AS Bowlruns,
            IFNULL(dismissal,0) as TeamWkts,
            --BowlSpeed,
            Penalty,
            BLExtras,
			BatSubject
        FROM Scorecard Sc
        INNER JOIN Players Pl
            ON Sc.BowlerID = Pl.Playerid
        WHERE matchid = ${req.params.matchid} AND inningsid = ${req.params.inningsid}
    ) A
    GROUP BY MatchID, InningsID, BowlerID, PlayerName, A.OverID
) V ON V.MatchID = S.MatchID AND V.InningsID = S.InningsID AND V.OverID = S.OverID AND V.Bowlerid = S.BowlerID
        GROUP BY S.BowlerId, Spell Order by MIN(S.OverID);


`;
        let result = await new Promise((resolve,reject)=>{
            db.all(q,[],(err,rows)=>{
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
router.get('/getPhaseDataTest/:matchid/:inningsid', async (req, res) => {
    try {
        let q = `SELECT 
    A.Day,
    A.Session,
    A.Runs as R,
    A.Wkts as W,
    (
        SELECT 
            CAST(SUM(CASE WHEN V.EndOver = 1 AND V.Blers >= 1 THEN 1 ELSE 0 END) AS TEXT) ||
            CASE 
                WHEN SUM(CASE WHEN V.EndOver = 0 THEN V.Balls ELSE 0 END) % 6 = 0
                THEN '' 
                ELSE '.' || CAST(SUM(CASE WHEN V.EndOver = 0 THEN V.Balls ELSE 0 END) % 6 AS TEXT)
            END
        FROM (
            SELECT 
                SUM(CASE WHEN Extratypeid NOT IN (1,2,5) THEN 1 ELSE 0 END) AS Balls,
                MAX(EndOver) AS EndOver,
                COUNT(DISTINCT BowlerID) AS Blers
            FROM Scorecard
            WHERE MatchID = ? 
              AND InningsID = ?
              AND Day = A.Day
              AND Session = A.Session
            GROUP BY OverID
        ) V
    ) AS O,
    A.[Bat SR],
    A.[Dot balls],
    A.[4s/6s],
    A.[1s/2s/3s],
    A.[Bound%],
    A.[Dot%],
    A.[LeftAlone%],
    A.[Wd/Nb],
    A.[Byes/Leg byes],
    A.TeamScore
FROM (
    SELECT 
        Day, Session,
        SUM(Runs + Extras + Penalty + BlExtras) AS Runs,
        SUM(CASE WHEN dismissaltypeid NOT IN (7, 8, 14) THEN 1 ELSE 0 END) AS Wkts,
        CAST(ROUND(SUM(runs + extras) * 100.0 / SUM(bowlballs), 1) AS TEXT) AS [Bat SR],
        SUM(CASE WHEN runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) AS [Dot balls],
        CAST(SUM(CASE WHEN runs = 4 THEN 1 ELSE 0 END) AS TEXT) || '/' ||
        CAST(SUM(CASE WHEN runs = 6 THEN 1 ELSE 0 END) AS TEXT) AS [4s/6s],
        CAST(SUM(CASE WHEN runs = 1 THEN 1 ELSE 0 END) AS TEXT) || '/' ||
        CAST(SUM(CASE WHEN runs = 2 THEN 1 ELSE 0 END) AS TEXT) || '/' ||
        CAST(SUM(CASE WHEN runs = 3 THEN 1 ELSE 0 END) AS TEXT) AS [1s/2s/3s],
        CAST(ROUND(SUM(BoundRuns) * 100.0 / SUM(runs), 1) AS TEXT) || ' %' AS [Bound%],
        CAST(ROUND(SUM(CASE WHEN runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) * 100.0 / SUM(bowlballs), 1) AS TEXT) || ' %' AS [Dot%],
        CAST(ROUND(SUM(CASE WHEN BatSubject = 3 THEN 1 ELSE 0 END) * 100.0 / SUM(bowlballs), 1) AS TEXT) || ' %' AS [LeftAlone%],
        CAST(SUM(Wd) AS TEXT) || '/' || CAST(SUM(Nb) AS TEXT) AS [Wd/Nb],
        CAST(SUM(Byes) AS TEXT) || '/' || CAST(SUM("Leg byes") AS TEXT) AS [Byes/Leg byes],
        CAST(MAX(Teamscore) AS TEXT) || '/' || CAST(MAX(TeamWkts) AS TEXT) AS TeamScore
    FROM (
        SELECT 
            runs,
            Penalty,
            BLextras,
            extras,
            dismissaltypeid,
            ballid,
            matchid,
            inningsid,
            Dismissal,
            Day, Session,
            extratypeid,
            BatSubject,
            CASE WHEN extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END AS bowlballs,
            CASE WHEN runs IN (4, 6) THEN runs ELSE 0 END AS BoundRuns,
            CASE WHEN extratypeid IN (1, 5) THEN extras ELSE 0 END AS Nb,
            CASE WHEN extratypeid = 2 THEN extras ELSE 0 END AS Wd,
            CASE WHEN extratypeid = 4 THEN extras ELSE 0 END AS Byes,
            CASE WHEN extratypeid = 3 THEN extras ELSE 0 END AS "Leg byes",
            SUM(IFNULL(Runs + Extras + Penalty + BlExtras, 0)) 
                OVER (PARTITION BY s.inningsid ORDER BY s.inningsid, Overs, Ballid) AS Teamscore,
            SUM(IFNULL(Dismissal, 0)) 
                OVER (PARTITION BY s.inningsid ORDER BY s.inningsid, Overs, Ballid) AS TeamWkts
        FROM scorecard S
        WHERE matchid = ? AND INNINGSID = ?
    ) B
    GROUP BY Day, Session
) A
ORDER BY A.Day, A.Session
`
        let matchResponse = await getData(q, [req.params.matchid, req.params.inningsid, req.params.matchid,req.params.inningsid]);
        res.send(matchResponse);
    }
    catch (err) {
        console.error("Error Fetching getPhaseDataTest:", err);
        res.status(500).send("Error Fetching getPhaseDataTest");
    }
});
router.get('/getOverComparison/:matchid', async (req, res) => {
    try {
        let q = `SELECT
     COALESCE(A.overid, B.overid) AS [OverNo],
     COALESCE(A.Bowler, '-') AS BowlerA,
     cast(sum(IFNULL((A.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as varchar) || '/' || cast(sum(IFNULL(A.dismissal,0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as varchar) TeamScoreA,
     ROunD(sum(IFNULL((cast(A.Runs as real)),0)) over (partition by A.inningsid order by A.inningsid,A.Overid)/A.Overid,1) RunRateA,
     COALESCE(A.Runs, '-') AS RunsA,
     (COALESCE(A.[4s], '-') || '/' || COALESCE(A.[6s], '-')) AS [FourSixA],
     (COALESCE(A.[1s], '-') || '/' || COALESCE(A.[2s], '-') || '/' || COALESCE(A.[3s], '-')) AS [OneTwoThreeA],
     (CASE WHEN A.Runs IS NOT NULL THEN ROUND((CAST(A.BoundRuns AS REAL) / CAST(A.Runs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [BoundRateA],
     (CASE WHEN A.bowlballs IS NOT NULL THEN ROUND((CAST(A.[0s] AS REAL) / CAST(A.bowlballs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [DotRateA],
     COALESCE(B.Bowler, '-') AS BowlerB,
     cast(sum(IFNULL((B.Runs),0)) over (partition by B.inningsid order by B.inningsid,B.Overid) as varchar) || '/' || cast(sum(IFNULL(B.dismissal,0)) over (partition by B.inningsid order by B.inningsid,B.Overid) as varchar) TeamScoreB,
     COALESCE(B.Runs, '-') AS RunsB,
     Round(sum(IFNULL((cast(B.Runs as REAL)),0)) over (partition by B.inningsid order by B.inningsid,B.Overid)/B.Overid,1) RunRateB,
     (COALESCE(B.[4s], '-') || '/' || COALESCE(B.[6s], '-')) AS [FourSixB],
     (COALESCE(B.[1s], '-') || '/' || COALESCE(B.[2s], '-') || '/' || COALESCE(B.[3s], '-')) AS [OneTwoThreeB],
     (CASE WHEN B.Runs IS NOT NULL THEN ROUND((CAST(B.BoundRuns AS REAL) / CAST(B.Runs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [BoundRateB],
     (CASE WHEN B.bowlballs IS NOT NULL THEN ROUND((CAST(B.[0s] AS REAL) / CAST(B.bowlballs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [DotRateB],
     MatchBalls-sum(IFNULL((B.BowlBalls),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as BallRemain,
     TotalRuns-sum(IFNULL((B.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) RunsRequired,
     ROund(Round((TotalRuns-sum(IFNULL((B.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid))*6,2)/(MatchBalls-sum(IFNULL((B.BowlBalls),0)) over (partition by A.inningsid order by A.inningsid,A.Overid)),2) as RRRequired
    ,TeamA,TeamB
 FROM
 (
 SELECT
          bsc.matchid  AS matchid,
         (overid ) AS overid,
         bsc.inningsid AS inningsid, Max(C.ClubName)  as TeamA,
         MAX(FullName) AS Bowler,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty+BLExtras) AS TEXT) AS Runs,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty) AS TEXT) AS Score,
         CAST(SUM(CASE WHEN bsc.runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) AS TEXT) AS [0s],
         CAST(SUM(CASE WHEN bsc.runs = 1 THEN 1 ELSE 0 END) AS TEXT) AS [1s],
         CAST(SUM(CASE WHEN bsc.runs = 2 THEN 1 ELSE 0 END) AS TEXT) AS [2s],
         CAST(SUM(CASE WHEN bsc.runs = 3 THEN 1 ELSE 0 END) AS TEXT) AS [3s],
         CAST(SUM(CASE WHEN bsc.runs = 4 AND isFour = 1 THEN 1 ELSE 0 END) AS TEXT) AS [4s],
         CAST(SUM(CASE WHEN bsc.runs = 6 AND isSix = 1 THEN 1 ELSE 0 END) AS TEXT) AS [6s],
         CAST(SUM(CASE WHEN bsc.runs IN (4, 6) AND (bsc.IsFour = 1 OR bsc.IsSix = 1) THEN bsc.runs ELSE 0 END) AS TEXT) AS BoundRuns,
         CAST(SUM(CASE WHEN extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END) AS TEXT) AS bowlballs,
         (select Sum(S.runs + S.extras + S.Penalty+S.BLExtras)+1 from ScoreCard S where S.Matchid=bsc.Matchid and S.InningsId=Bsc.Inningsid)as TotalRuns

  , CAST(SUM(Dismissal) AS TEXT) AS Dismissal
     FROM ScoreCard bsc
     JOIN Players P ON bsc.BowlerID = P.PlayerID
     JOIN Match M ON M.ID = bsc.MatchID
     Left join Innings I on I.MatchId=M.ID and I.InningsID=bsc.InningsID
     Left join Club C on C.Clubid=I.BowlingClubID
     WHERE bsc.matchid =${req.params.matchid} AND bsc.inningsid = 1 AND overid IS NOT NULL AND bowlerid IS NOT NULL
     GROUP BY bsc.overid,  bsc.matchid, bsc.inningsid, bowlerid
     )A
 Full join (

 SELECT
         bsc.matchid  AS matchid,
         (overid ) AS overid,
         bsc.inningsid AS inningsid, Max(C.ClubName)  as TeamB,
         MAX(FullName) AS Bowler,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty)+BLExtras AS TEXT) AS Runs,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty) AS TEXT) AS Score,
         CAST(SUM(CASE WHEN bsc.runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) AS TEXT) AS [0s],
         CAST(SUM(CASE WHEN bsc.runs = 1 THEN 1 ELSE 0 END) AS TEXT) AS [1s],
         CAST(SUM(CASE WHEN bsc.runs = 2 THEN 1 ELSE 0 END) AS TEXT) AS [2s],
         CAST(SUM(CASE WHEN bsc.runs = 3 THEN 1 ELSE 0 END) AS TEXT) AS [3s],
         CAST(SUM(CASE WHEN bsc.runs = 4 AND isFour = 1 THEN 1 ELSE 0 END) AS TEXT) AS [4s],
         CAST(SUM(CASE WHEN bsc.runs = 6 AND isSix = 1 THEN 1 ELSE 0 END) AS TEXT) AS [6s],
         CAST(SUM(CASE WHEN bsc.runs IN (4, 6) AND (bsc.IsFour = 1 OR bsc.IsSix = 1) THEN bsc.runs ELSE 0 END) AS TEXT) AS BoundRuns,
         CAST(SUM(CASE WHEN extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END) AS TEXT) AS bowlballs
         ,CAST(SUM(Dismissal) AS TEXT) AS Dismissal
         ,MAX(MatchOvers*6) as MatchBalls
     FROM ScoreCard bsc
     JOIN Players P ON bsc.BowlerID = P.PlayerID
     JOIN Match M ON M.ID = bsc.MatchID
     Left join Innings I on I.MatchId=M.ID and I.InningsID=bsc.InningsID
     Left join Club C on C.Clubid=I.BowlingClubID
     WHERE bsc.matchid =${req.params.matchid} AND bsc.inningsid = 2 AND overid IS NOT NULL AND bowlerid IS NOT NULL
     GROUP BY bsc.overid,  bsc.matchid, bsc.inningsid, bowlerid
     )B
     on A.matchid=B.Matchid  and A.Overid=B.Overid ORDER BY
     CAST(COALESCE(A.Overid, B.Overid, '-') AS INT) ASC,
     CAST(B.Overid AS INT) ASC;`
        let result = await new Promise((resolve, reject) => {
            db.all(q, [], (err, rows) => {
                if (err) {
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        })
        res.send(result);
    }
    catch (err) {
        console.error("Error Fetching getOverComparisonData:", err);
        res.status(500).send("Error Fetching getOverComparisonData");
    }
});

router.get('/getOverComparisonTest3rd4th/:matchid', async (req, res) => {
    try {
        let q = `SELECT
     COALESCE(A.overid, B.overid) AS [OverNo],
     COALESCE(A.Bowler, '-') AS BowlerA,
     cast(sum(IFNULL((A.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as varchar) || '/' || cast(sum(IFNULL(A.dismissal,0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as varchar) TeamScoreA,
     ROunD(sum(IFNULL((cast(A.Runs as real)),0)) over (partition by A.inningsid order by A.inningsid,A.Overid)/A.Overid,1) RunRateA,
     COALESCE(A.Runs, '-') AS RunsA,
     (COALESCE(A.[4s], '-') || '/' || COALESCE(A.[6s], '-')) AS [FourSixA],
     (COALESCE(A.[1s], '-') || '/' || COALESCE(A.[2s], '-') || '/' || COALESCE(A.[3s], '-')) AS [OneTwoThreeA],
     (CASE WHEN A.Runs IS NOT NULL THEN ROUND((CAST(A.BoundRuns AS REAL) / CAST(A.Runs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [BoundRateA],
     (CASE WHEN A.bowlballs IS NOT NULL THEN ROUND((CAST(A.[0s] AS REAL) / CAST(A.bowlballs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [DotRateA],
     COALESCE(B.Bowler, '-') AS BowlerB,
     cast(sum(IFNULL((B.Runs),0)) over (partition by B.inningsid order by B.inningsid,B.Overid) as varchar) || '/' || cast(sum(IFNULL(B.dismissal,0)) over (partition by B.inningsid order by B.inningsid,B.Overid) as varchar) TeamScoreB,
     COALESCE(B.Runs, '-') AS RunsB,
     Round(sum(IFNULL((cast(B.Runs as REAL)),0)) over (partition by B.inningsid order by B.inningsid,B.Overid)/B.Overid,1) RunRateB,
     (COALESCE(B.[4s], '-') || '/' || COALESCE(B.[6s], '-')) AS [FourSixB],
     (COALESCE(B.[1s], '-') || '/' || COALESCE(B.[2s], '-') || '/' || COALESCE(B.[3s], '-')) AS [OneTwoThreeB],
     (CASE WHEN B.Runs IS NOT NULL THEN ROUND((CAST(B.BoundRuns AS REAL) / CAST(B.Runs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [BoundRateB],
     (CASE WHEN B.bowlballs IS NOT NULL THEN ROUND((CAST(B.[0s] AS REAL) / CAST(B.bowlballs AS REAL)) * 100, 1) ELSE '-' END) || '%' AS [DotRateB],
     MatchBalls-sum(IFNULL((B.BowlBalls),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) as BallRemain,
     TotalRuns-sum(IFNULL((B.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid) RunsRequired,
     ROund(Round((TotalRuns-sum(IFNULL((B.Runs),0)) over (partition by A.inningsid order by A.inningsid,A.Overid))*6,2)/(MatchBalls-sum(IFNULL((B.BowlBalls),0)) over (partition by A.inningsid order by A.inningsid,A.Overid)),2) as RRRequired
    ,TeamA,TeamB
 FROM
 (
 SELECT
          bsc.matchid  AS matchid,
         (overid ) AS overid,
         bsc.inningsid AS inningsid, Max(C.ClubName)  as TeamA,
         MAX(FullName) AS Bowler,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty+BLExtras) AS TEXT) AS Runs,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty) AS TEXT) AS Score,
         CAST(SUM(CASE WHEN bsc.runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) AS TEXT) AS [0s],
         CAST(SUM(CASE WHEN bsc.runs = 1 THEN 1 ELSE 0 END) AS TEXT) AS [1s],
         CAST(SUM(CASE WHEN bsc.runs = 2 THEN 1 ELSE 0 END) AS TEXT) AS [2s],
         CAST(SUM(CASE WHEN bsc.runs = 3 THEN 1 ELSE 0 END) AS TEXT) AS [3s],
         CAST(SUM(CASE WHEN bsc.runs = 4 AND isFour = 1 THEN 1 ELSE 0 END) AS TEXT) AS [4s],
         CAST(SUM(CASE WHEN bsc.runs = 6 AND isSix = 1 THEN 1 ELSE 0 END) AS TEXT) AS [6s],
         CAST(SUM(CASE WHEN bsc.runs IN (4, 6) AND (bsc.IsFour = 1 OR bsc.IsSix = 1) THEN bsc.runs ELSE 0 END) AS TEXT) AS BoundRuns,
         CAST(SUM(CASE WHEN extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END) AS TEXT) AS bowlballs,
         (select Sum(S.runs + S.extras + S.Penalty+S.BLExtras)+1 from ScoreCard S where S.Matchid=bsc.Matchid and S.InningsId=Bsc.Inningsid)as TotalRuns

  , CAST(SUM(Dismissal) AS TEXT) AS Dismissal
     FROM ScoreCard bsc
     JOIN Players P ON bsc.BowlerID = P.PlayerID
     JOIN Match M ON M.ID = bsc.MatchID
     Left join Innings I on I.MatchId=M.ID and I.InningsID=bsc.InningsID
     Left join Club C on C.Clubid=I.BowlingClubID
     WHERE bsc.matchid =${req.params.matchid} AND bsc.inningsid = 3 AND overid IS NOT NULL AND bowlerid IS NOT NULL
     GROUP BY bsc.overid,  bsc.matchid, bsc.inningsid, bowlerid
     )A
 Full join (

 SELECT
         bsc.matchid  AS matchid,
         (overid ) AS overid,
         bsc.inningsid AS inningsid, Max(C.ClubName)  as TeamB,
         MAX(FullName) AS Bowler,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty)+BLExtras AS TEXT) AS Runs,
         CAST(SUM(bsc.runs + bsc.extras + bsc.Penalty) AS TEXT) AS Score,
         CAST(SUM(CASE WHEN bsc.runs = 0 AND extratypeid NOT IN (2) THEN 1 ELSE 0 END) AS TEXT) AS [0s],
         CAST(SUM(CASE WHEN bsc.runs = 1 THEN 1 ELSE 0 END) AS TEXT) AS [1s],
         CAST(SUM(CASE WHEN bsc.runs = 2 THEN 1 ELSE 0 END) AS TEXT) AS [2s],
         CAST(SUM(CASE WHEN bsc.runs = 3 THEN 1 ELSE 0 END) AS TEXT) AS [3s],
         CAST(SUM(CASE WHEN bsc.runs = 4 AND isFour = 1 THEN 1 ELSE 0 END) AS TEXT) AS [4s],
         CAST(SUM(CASE WHEN bsc.runs = 6 AND isSix = 1 THEN 1 ELSE 0 END) AS TEXT) AS [6s],
         CAST(SUM(CASE WHEN bsc.runs IN (4, 6) AND (bsc.IsFour = 1 OR bsc.IsSix = 1) THEN bsc.runs ELSE 0 END) AS TEXT) AS BoundRuns,
         CAST(SUM(CASE WHEN extratypeid NOT IN (1, 2, 5) THEN 1 ELSE 0 END) AS TEXT) AS bowlballs
         ,CAST(SUM(Dismissal) AS TEXT) AS Dismissal
         ,MAX(MatchOvers*6) as MatchBalls
     FROM ScoreCard bsc
     JOIN Players P ON bsc.BowlerID = P.PlayerID
     JOIN Match M ON M.ID = bsc.MatchID
     Left join Innings I on I.MatchId=M.ID and I.InningsID=bsc.InningsID
     Left join Club C on C.Clubid=I.BowlingClubID
     WHERE bsc.matchid =${req.params.matchid} AND bsc.inningsid = 4 AND overid IS NOT NULL AND bowlerid IS NOT NULL
     GROUP BY bsc.overid,  bsc.matchid, bsc.inningsid, bowlerid
     )B
     on A.matchid=B.Matchid  and A.Overid=B.Overid ORDER BY
     CAST(COALESCE(A.Overid, B.Overid, '-') AS INT) ASC,
     CAST(B.Overid AS INT) ASC;`
        let result = await new Promise((resolve, reject) => {
            db.all(q, [], (err, rows) => {
                if (err) {
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        })
        res.send(result);
    }
    catch (err) {
        console.error("Error Fetching getOverComparisontest3rd4thData:", err);
        res.status(500).send("Error Fetching getOverComparisontest3rd4thData");
    }
});

export default router;
