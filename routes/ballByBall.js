import express from 'express';
import db from '../dbConfig.js';
const router = express.Router();

const query = `SELECT S.*,ST.FULLNAME as StrikerName,NST.FULLNAME AS NonStrikerName,BR.FULLNAME AS BowlerName,I.BattingClubID,I.BowlingClubID,DF.FULLNAME as DismissalFielder1Name
               ,SUM(S.RUNS + S.EXTRAS+S.PENALTY) OVER(PARTITION BY S.MATCHID,S.INNINGSID ORDER BY OVERS,BALLID) AS TeamRuns
               ,SUM(S.Dismissal) OVER(PARTITION BY S.MATCHID,S.INNINGSID ORDER BY OVERS,BALLID) AS TeamWickets
               ,S.RUNS + CASE WHEN EXTRATYPEID IN (1,2,5) THEN S.EXTRAS ELSE 0 END Bowlruns
               ,CASE WHEN EXTRATYPEID NOT IN (1,2,5) THEN 1 ELSE 0 END Bowlballs
               ,CASE WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) THEN 1 ELSE 0 END Bowlwkts
               ,CASE WHEN S.EXTRATYPEID NOT IN(2) THEN 1 ELSE 0 END AS Batballs
               ,S.RUNS Batruns,DB.FullName AS DismissedBatterName
               ,F.FullName as FielderName
               ,CASE WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) THEN 1 ELSE 0 END Batwkts
               ,(select SUM(CASE WHEN (bowlruns=0 and endover=1 and (bowlballs=7  or bowlballs=6 or bowlballs=5)) THEN 1 ELSE 0 END)
                   from (select MatchId,InningsId,OverId,Max(Endover)Endover
                         ,Sum(RUNS + CASE WHEN EXTRATYPEID IN (1,2,5) THEN EXTRAS ELSE 0 END) as BowlRuns
                         ,Sum(CASE WHEN EXTRATYPEID NOT IN (1,2,5) THEN 1 ELSE 0 END) Bowlballs
                         from Scorecard where MATCHID=? Group by  MatchId,InningsId,OverId
                         )V where S.MatchID=V.MatchID and S.InningsID=V.InningsID and S.OverID=V.OverID  Group by  MatchId,InningsId,OverId ) as [Maiden]
               ,BS.DisplayName AS DeliveryStyleName
               ,BS.SpinOrPace
               ,SK.DisplayName AS StrokeName
               ,DT.Description AS DismissalTypeDesc
               ,case when S.Nonstrikerid  > S.strikerid  then cast(S.strikerid as varchar(10))||'-'||cast(S.Nonstrikerid as varchar(10)) else cast(S.Nonstrikerid as varchar(10))||'-'||cast(S.strikerid as varchar(10)) end Partnerid
               ,cast((187 - PM_X) / 1.494  as int)PM_X_CM
               ,cast(ROUND(CASE WHEN PM_Y >= 960 THEN PM_Y
                           ELSE  CASE WHEN ((-0.8073 + SQRT((0.65173329 ) - 4 * 0.0000991 * (97.5874 - PM_Y))) / (2 * 0.0000991)) < 450
                                      THEN ((-0.8073 + SQRT((0.65173329) - 4 * 0.0000991 * (97.5874 - PM_Y))) / (2 * 0.0000991)) - 7
                                 ELSE (-0.8073 + SQRT((0.65173329) - 4 * 0.0000991 * (97.5874 - PM_Y))) / (2 * 0.0000991)
                                 END
                           END,  1) as int) as PM_Y_CM
               ,ABS(180 - ((2 * 3.14159265359) - ATAN2((WagonWheelX - 300), (WagonWheelY - 259))) * (180 / 3.14159265359)) as WW_Angle
               ,ROUND(SQRT((S.WagonWheelX - 300) * (S.WagonWheelX - 300) + (S.WagonWheelY - 300) * (S.WagonWheelY - 300)), 0) AS WW_Distance
		,ROUND((SQRT((S.WagonWheelX - 300) * (S.WagonWheelX - 300) + (S.WagonWheelY - 300) * (S.WagonWheelY - 300)) / 258) * 100, 2) AS WW_DistancePercentage
               ,cast(Round((305 - SZ_X) / 1.35,0) as int)  as SZ_X_CM
               ,cast(ROUND(((405 - SZ_Y) * 71) / 90,0)  as int)  as SZ_Y_CM
               ,ST.BattingTypeID as StBattingTypeID
               ,BR.BowlingTypeID as BwBowlingTypeID
            FROM SCORECARD S 
             LEFT JOIN PLAYERS ST on ST.PLAYERID=S.STRIKERID 
             LEFT JOIN PLAYERS NST ON NST.PLAYERID = S.NONSTRIKERID
             LEFT JOIN PLAYERS BR ON BR.PLAYERID = S.BOWLERID
             LEFT JOIN PLAYERS DF ON DF.PLAYERID = S.DISMISSALFIELDERID1
             LEFT JOIN PLAYERS F ON F.PLAYERID = S.FielderID
             LEFT JOIN PLAYERS DB ON DB.PlayerID = S.DismissedBatter
             LEFT JOIN BOWLINGSTYLE BS ON BS.Id = S.DeliveryStyle
             LEFT JOIN STROKE SK ON SK.ID = S.STROKETYPE
             LEFT JOIN DISMISSALTYPE DT ON DT.ID = S.DismissalTypeID
             JOIN INNINGS I ON I.INNINGSID = S.INNINGSID AND I.MATCHID = S.MATCHID
                 WHERE S.MATCHID=? ORDER BY S.INNINGSID ASC,S.BALLID ASC;`;

router.get('/:matchid', async (req, res) => {
    try {
        let result = await new Promise((resolve, reject) => {
            db.all(query, [req.params.matchid,req.params.matchid], (err, rows) => {
                if (err) {
                    res.status(500);
                    return reject(err);
                }
                res.status(200);
                resolve(rows);
            });
        })
        res.send({
            status: res.statusCode,
            data: result
        });
    } catch (err) {
        console.error("Error Fetching BallByBall:", err);
        res.status(500).send("Error Fetching BallByBall");
    }
});

export default router;