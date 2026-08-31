import express from 'express';
import db from '../dbConfig.js';
const router = express.Router();

const query = `With LastBall as (
SELECT MAX(CASE WHEN Sc.Inningsid=1 THEN SC.BallID END)Firstinnlastball,MAX(CASE WHEN Sc.Inningsid=2 THEN SC.BallID END)Secondinnlastball FROM Scorecard SC Where SC.MatchID=?
),
PartnershipCTE as (

SELECT A.MatchID,A.InningsID,NULLIF(A.PartnerId,B.PartnerId) as PartnerId ,NULLIF(A.Wkt,B.Wkt) AS Wkt,NULLIF(B.Overs,0) AS StartOver,Coalesce(Cast(B.BallID as int)+1,0) AS StartBallID,A.Overs AS [EndOver],A.BallID AS [EndBallID]
FROM (SELECT MatchID,InningsID,DENSE_RANK() OVER(Partition by InningsID ORDER BY Overs,S.BallID)Wkt,BallID,Overs,DismissalTypeID
,CASE WHEN NonStrikerID > StrikerID THEN StrikerID || '-' || NonStrikerID ELSE NonStrikerID || '-' || StrikerID END as PartnerId
FROM Scorecard S Where S.MatchID=?  AND (S.DismissalTypeID NOT IN(7,8,14) or S.NonBallType in (9,11) or (S.InningsID=1 AND BallID in(select Firstinnlastball from LastBall)) OR(S.InningsID=2 AND S.BallID in(select Secondinnlastball from LastBall)))
) A LEFT JOIN
(SELECT MatchID,InningsID,DENSE_RANK() OVER(Partition by InningsID ORDER BY Overs,S.BallID)Wkt,BallID,Overs,DismissalTypeID
,CASE WHEN NonStrikerID > StrikerID THEN StrikerID || '-' || NonStrikerID ELSE NonStrikerID || '-' || StrikerID END as PartnerId
FROM Scorecard S Where S.MatchID=?  AND (S.DismissalTypeID NOT IN(7,8,14) or S.NonBallType in (9,11) or (S.InningsID=1 AND BallID in(select Firstinnlastball from LastBall)) OR(S.InningsID=2 AND S.BallID in(select Secondinnlastball from LastBall)))
) B ON A.MatchID=B.MatchID AND A.InningsID=B.InningsID AND A.Wkt=B.Wkt+1
)

SELECT S.*,ST.FULLNAME as StrikerName,NST.FULLNAME AS NonStrikerName,BR.FULLNAME AS BowlerName,I.BattingClubID,I.BowlingClubID,DF.FULLNAME as DismissalFielder1Name
               ,DF2.FullName AS DismissalFielder2Name
               ,SUM(S.RUNS + S.EXTRAS+ IFNULL(p.Penalty, 0) + S.BLExtras) OVER(PARTITION BY S.MATCHID,S.INNINGSID ORDER BY s.OVERS,S.BALLID) AS TeamRuns
               ,SUM(S.Dismissal) OVER(PARTITION BY S.MATCHID,S.INNINGSID ORDER BY s.OVERS,S.BALLID) AS TeamWickets
               ,S.RUNS + CASE WHEN EXTRATYPEID IN (1,2,5) THEN S.EXTRAS ELSE 0 END Bowlruns
               ,CASE WHEN EXTRATYPEID NOT IN (1,2,5) THEN 1 ELSE 0 END Bowlballs
               ,CASE WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) THEN 1 ELSE 0 END Bowlwkts
               ,CASE WHEN S.EXTRATYPEID NOT IN(2) THEN 1 ELSE 0 END AS Batballs
               ,S.RUNS Batruns,DB.FullName AS DismissedBatterName
               ,F.FullName as FielderName
               ,CASE WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) THEN 1 ELSE 0 END Batwkts
               ,(select SUM(CASE WHEN (bowlruns=0 and endover=1 and (bowlballs=7  or bowlballs=6 or bowlballs=5)) THEN 1 ELSE 0 END)
                   from (select MatchId,InningsId,s.OverId,Max(Endover)Endover
                         ,Sum(RUNS + CASE WHEN EXTRATYPEID IN (1,2,5) THEN EXTRAS ELSE 0 END) as BowlRuns
                         ,Sum(CASE WHEN EXTRATYPEID NOT IN (1,2,5) THEN 1 ELSE 0 END) Bowlballs
                         from Scorecard s where MATCHID=? Group by  MatchId,InningsId,s.OverId
                         )V where S.MatchID=V.MatchID and S.InningsID=V.InningsID and S.OverID=V.OverID  Group by  MatchId,InningsId,OverId ) as [Maiden]
               ,BS.DisplayName AS DeliveryStyleName
               ,BS.SpinOrPace
               ,SK.DisplayName AS StrokeName
               ,DT.Description AS DismissalTypeDesc
               ,case when S.Nonstrikerid  > S.strikerid  then cast(S.strikerid as varchar(10))||'-'||cast(S.Nonstrikerid as varchar(10)) else cast(S.Nonstrikerid as varchar(10))||'-'||cast(S.strikerid as varchar(10)) end Partnerid
               ,cast((179 - PM_X) / 1.494  as int)PM_X_CM
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
               ,CMT.DisplayName AS CreaseMovementName
               ,BSM.Description as BatSubjectName
               ,ST.BattingTypeID AS BatTypeID
               ,I.VideoMode AS InVideoMode
               ,I.VideoPath As InVideoPath
               ,BO.BattingOrder AS BatOrder
               ,NBD.FullName as NonBallDismissalBatter
               ,Case when TB.Over=S.Overid then true else false end  as MultipleBowlers
               , CASE WHEN MT.MatchTypeID IN (2,5,9,12,15,18,21,36) THEN
                    CASE
                        WHEN S.OverID >= 1 AND S.OverID <= 10 THEN '01-10'
                        WHEN S.OverID >= 11 AND S.OverID <= 20 THEN '11-20'
                        WHEN S.OverID >= 21 AND S.OverID <= 30 THEN '21-30'
                        WHEN S.OverID >= 31 AND S.OverID <= 40 THEN '31-40'
                        WHEN S.OverID >= 41 AND S.OverID <= 50 THEN '41-50'
                    END
                WHEN MT.MatchTypeID IN (3,6,10,13,16,19,22,28,31,34,39,40,45,53,54) THEN
                    CASE
                        WHEN S.OverID >= 1 AND S.OverID <= 6 THEN '01-06'
                        WHEN S.OverID >= 7 AND S.OverID <= 10 THEN '07-10'
                        WHEN S.OverID >= 11 AND S.OverID <= 15 THEN '11-15'
                        WHEN S.OverID >= 16 AND S.OverID <= 20 THEN '16-20'
                    END
            END AS PhaseofPlay,NULLIF(PNSp.WKT,0) as PartnerWktOrder
            ,CASE WHEN ',' || S.Batsman || ',' LIKE '%,5,%' THEN 1 
              ELSE 0 
            END AS Uncomfortable,ifnull(p.Penalty,0) as Penalty1 , AT.LengthX as PM_X_CM_Hauk,AT.LengthY as PM_Y_CM_Hauk, AT.HeightX as SZ_X_CM_Batter, AT.HeightY as SZ_Y_CM_Batter, AT.StumpHeightX as SZ_X_CM_Stump, AT.StumpHeightY as SZ_Y_CM_Stump,AT.CreaseHeightX as SZ_X_CM_crease, AT.CreaseHeightY as SZ_Y_CM_Crease,AT.RPX AS RPX_H,AT.RPY AS RPY_H, AT.Swing  AS Swing_H, AT.Deviation AS Deviation_H, AT.ReactionTime_to_Crease AS ReactionTime_to_Crease_H, AT.ReactionTime_to_interception AS ReactionTime_to_interception_H,AT.IPX_CM AS IPX_CM_H,ABS(ROUND(405 - ((NULLIF(AT.HeightY,-99990) * 90) / 71),0))  AS IPY_CM_H, AT.ReleaseSpeed AS ReleaseSpeed ,AT.StumpHeightY AS BounsHeight,AT.DIP AS Dip
            ,CASE WHEN S.BatSubject=5 or S.BatSubject like '%5%' OR S.ShotConnection IN (1,2,3,4,5,11,12)  THEN 1 ELSE 0 END AS [FS]
            FROM SCORECARD S
             LEFT JOIN PLAYERS ST on ST.PLAYERID=S.STRIKERID
             LEFT JOIN PLAYERS NST ON NST.PLAYERID = S.NONSTRIKERID
             LEFT JOIN PLAYERS BR ON BR.PLAYERID = S.BOWLERID
             LEFT JOIN PLAYERS DF ON DF.PLAYERID = S.DISMISSALFIELDERID1
             LEFT JOIN PLAYERS DF2 ON DF.PLAYERID = S.DISMISSALFIELDERID2
             LEFT JOIN PLAYERS F ON F.PLAYERID = S.FielderID
             LEFT JOIN PLAYERS DB ON DB.PlayerID = S.DismissedBatter
             LEFT JOIN PLAYERS NBD ON NBD.PlayerID = S.NonBall_dismissBatter
             LEFT JOIN BOWLINGSTYLE BS ON BS.Id = S.DeliveryStyle
             LEFT JOIN STROKE SK ON SK.ID = S.STROKETYPE
             LEFT JOIN DISMISSALTYPE DT ON DT.ID = S.DismissalTypeID
             LEFT JOIN CREASEMOVEMENT CMT ON CMT.Id = S.CreaseMovement
             LEFT JOIN BATSUBJECTMASTER BSM ON BSM.Id = S.BatSubject
             LEFT JOIN BATTINGORDER BO ON BO.MatchID = S.MatchId AND BO.InningsID=S.InningsId AND BO.PlayerID = S.StrikerID
             JOIN MATCH MT ON MT.ID = S.MATCHID
             LEFT JOIN STADIUM STD ON STD.ID = MT.StadiumID
             JOIN INNINGS I ON I.INNINGSID = S.INNINGSID AND I.MATCHID = S.MATCHID
             left JOIN Penalty p ON p.INNINGSID = S.INNINGSID AND p.MATCHID = S.MATCHID and p.overs = s.Overs
             LEFT JOIN (select MatchId,Inningsid,s.Overid Over from SCorecard s where MatchId=? Group by MatchId,Inningsid,Overid having COunt(distinct Bowlerid)>1) TB on TB.Matchid=S.MatchId and S.Inningsid=TB.Inningsid and S.Overid=TB.Over
             LEFT JOIN PartnershipCTE PNSP on PNSP.Matchid=S.MatchId and PNSP.InningsID=S.InningsID AND S.BallID BETWEEN Coalesce(PNSP.StartBallID,0) AND Coalesce(PNSP.EndBallID,0)
             LEFT JOIN Advancetracking AT on AT.MatchID = S.MatchId and AT.BallID = S.BALLID and AT.InningsID =  S.INNINGSID 
              WHERE S.MATCHID=? ORDER BY S.INNINGSID ASC,S.OverId,S.Overs,S.BALLID ASC;`;

router.get('/:matchid', async (req, res) => {
    try {
        let result = await new Promise((resolve, reject) => {
            db.all(query, [req.params.matchid, req.params.matchid, req.params.matchid, req.params.matchid, req.params.matchid, req.params.matchid], (err, rows) => {
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
