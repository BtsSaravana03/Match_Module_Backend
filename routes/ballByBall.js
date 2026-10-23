import express from 'express';
import db from '../dbConfig.js';
const router = express.Router();

const query = `
WITH
LastBall AS (
    SELECT
        MAX(CASE WHEN InningsID = 1 THEN BallID END) AS Firstinnlastball,
        MAX(CASE WHEN InningsID = 2 THEN BallID END) AS Secondinnlastball
    FROM Scorecard
    WHERE MatchID = ?
),

-- Rank partnership candidates only once.
RankedPartnership AS MATERIALIZED (
    SELECT
        S.MatchID,
        S.InningsID,
        DENSE_RANK() OVER (
            PARTITION BY S.InningsID
            ORDER BY S.Overs, S.BallID
        ) AS Wkt,
        S.BallID,
        S.Overs,
        S.DismissalTypeID,
        CASE
            WHEN S.NonStrikerID > S.StrikerID
                THEN CAST(S.StrikerID AS TEXT) || '-' ||
                     CAST(S.NonStrikerID AS TEXT)
            ELSE CAST(S.NonStrikerID AS TEXT) || '-' ||
                 CAST(S.StrikerID AS TEXT)
        END AS PartnerId
    FROM Scorecard S
    CROSS JOIN LastBall LB
    WHERE S.MatchID = ?
      AND (
            S.DismissalTypeID NOT IN (7, 8, 14)
            OR S.NonBallType IN (9, 11)
            OR (
                S.InningsID = 1
                AND S.BallID = LB.Firstinnlastball
            )
            OR (
                S.InningsID = 2
                AND S.BallID = LB.Secondinnlastball
            )
      )
),

PartnershipCTE AS (
    SELECT
        A.MatchID,
        A.InningsID,
        NULLIF(A.PartnerId, B.PartnerId) AS PartnerId,
        NULLIF(A.Wkt, B.Wkt) AS Wkt,
        NULLIF(B.Overs, 0) AS StartOver,
        COALESCE(CAST(B.BallID AS INTEGER) + 1, 0) AS StartBallID,
        A.Overs AS EndOver,
        A.BallID AS EndBallID
    FROM RankedPartnership A
    LEFT JOIN RankedPartnership B
        ON A.MatchID = B.MatchID
       AND A.InningsID = B.InningsID
       AND A.Wkt = B.Wkt + 1
),

-- Aggregate maiden-over inputs once per over.
MaidenCTE AS (
    SELECT
        MatchID,
        InningsID,
        OverID,
        CASE
            WHEN MAX(Endover) = 1
             AND SUM(
                    RUNS +
                    CASE
                        WHEN EXTRATYPEID IN (1, 2, 5)
                            THEN EXTRAS
                        ELSE 0
                    END
                 ) = 0
             AND SUM(
                    CASE
                        WHEN EXTRATYPEID NOT IN (1, 2, 5)
                            THEN 1
                        ELSE 0
                    END
                 ) IN (5, 6, 7)
            THEN 1
            ELSE 0
        END AS Maiden
    FROM Scorecard
    WHERE MatchID = ?
    GROUP BY MatchID, InningsID, OverID
),

-- Find overs bowled by more than one bowler.
MultipleBowlersCTE AS (
    SELECT
        MatchID,
        InningsID,
        OverID
    FROM Scorecard
    WHERE MatchID = ?
    GROUP BY MatchID, InningsID, OverID
    HAVING COUNT(DISTINCT BowlerID) > 1
)

SELECT
    S.*,

    ST.FullName AS StrikerName,
    NST.FullName AS NonStrikerName,
    BR.FullName AS BowlerName,
    I.BattingClubID,
    I.BowlingClubID,
    DF.FullName AS DismissalFielder1Name,
    DF2.FullName AS DismissalFielder2Name,

    SUM(
        S.RUNS + S.EXTRAS + IFNULL(P.Penalty, 0) + S.BLExtras
    ) OVER (
        PARTITION BY S.MatchID, S.InningsID
        ORDER BY S.OVERS, S.BallID
    ) AS TeamRuns,

    SUM(S.Dismissal) OVER (
        PARTITION BY S.MatchID, S.InningsID
        ORDER BY S.OVERS, S.BallID
    ) AS TeamWickets,

    S.RUNS +
        CASE
            WHEN S.EXTRATYPEID IN (1, 2, 5) THEN S.EXTRAS
            ELSE 0
        END AS Bowlruns,

    CASE
        WHEN S.EXTRATYPEID NOT IN (1, 2, 5) THEN 1
        ELSE 0
    END AS Bowlballs,

    CASE
        WHEN S.DISMISSALTYPEID NOT IN (4, 7, 8, 14, 10, 0)
            THEN 1
        ELSE 0
    END AS Bowlwkts,

    CASE
        WHEN S.EXTRATYPEID NOT IN (2) THEN 1
        ELSE 0
    END AS Batballs,

    S.RUNS AS Batruns,

    DB.FullName AS DismissedBatterName,
    F.FullName AS FielderName,

    CASE
        WHEN S.DISMISSALTYPEID NOT IN (4, 7, 8, 14, 10, 0)
            THEN 1
        ELSE 0
    END AS Batwkts,

    MC.Maiden AS Maiden,

    BS.DisplayName AS DeliveryStyleName,
    BS.SpinOrPace,
    SK.DisplayName AS StrokeName,
    DT.Description AS DismissalTypeDesc,

    CASE
        WHEN S.NonStrikerID > S.StrikerID
            THEN CAST(S.StrikerID AS TEXT) || '-' ||
                 CAST(S.NonStrikerID AS TEXT)
        ELSE CAST(S.NonStrikerID AS TEXT) || '-' ||
             CAST(S.StrikerID AS TEXT)
    END AS Partnerid,

    CAST((179 - S.PM_X) / 1.494 AS INTEGER) AS PM_X_CM,

    CAST(
        ROUND(
            CASE
                WHEN S.PM_Y >= 960 THEN S.PM_Y
                ELSE
                    CASE
                        WHEN (
                            (-0.8073 + SQRT(
                                0.65173329 -
                                4 * 0.0000991 * (97.5874 - S.PM_Y)
                            )) / (2 * 0.0000991)
                        ) < 450
                        THEN (
                            (-0.8073 + SQRT(
                                0.65173329 -
                                4 * 0.0000991 * (97.5874 - S.PM_Y)
                            )) / (2 * 0.0000991)
                        ) - 7
                        ELSE
                            (-0.8073 + SQRT(
                                0.65173329 -
                                4 * 0.0000991 * (97.5874 - S.PM_Y)
                            )) / (2 * 0.0000991)
                    END
            END,
            1
        ) AS INTEGER
    ) AS PM_Y_CM,

    ABS(
        180 -
        (
            (2 * 3.14159265359) -
            ATAN2(
                (S.WagonWheelX - 300),
                (S.WagonWheelY - 259)
            )
        ) * (180 / 3.14159265359)
    ) AS WW_Angle,

    ROUND(
        SQRT(
            (S.WagonWheelX - 300) * (S.WagonWheelX - 300) +
            (S.WagonWheelY - 300) * (S.WagonWheelY - 300)
        ),
        0
    ) AS WW_Distance,

    ROUND(
        (
            SQRT(
                (S.WagonWheelX - 300) * (S.WagonWheelX - 300) +
                (S.WagonWheelY - 300) * (S.WagonWheelY - 300)
            ) / 258
        ) * 100,
        2
    ) AS WW_DistancePercentage,

    CAST(ROUND((305 - S.SZ_X) / 1.35, 0) AS INTEGER) AS SZ_X_CM,
    CAST(ROUND(((405 - S.SZ_Y) * 71) / 90, 0) AS INTEGER) AS SZ_Y_CM,

    ST.BattingTypeID AS StBattingTypeID,
    BR.BowlingTypeID AS BwBowlingTypeID,
    CMT.DisplayName AS CreaseMovementName,
    BSM.Description AS BatSubjectName,
    ST.BattingTypeID AS BatTypeID,

    I.VideoMode AS InVideoMode,
    I.VideoPath AS InVideoPath,
    BO.BattingOrder AS BatOrder,

    NBD.FullName AS NonBallDismissalBatter,

    CASE
        WHEN TB.OverID = S.OverID THEN TRUE
        ELSE FALSE
    END AS MultipleBowlers,

    CASE
        WHEN MT.MatchTypeID IN (2, 5, 9, 12, 15, 18, 21, 36)
        THEN
            CASE
                WHEN S.OverID BETWEEN 1 AND 10 THEN '01-10'
                WHEN S.OverID BETWEEN 11 AND 20 THEN '11-20'
                WHEN S.OverID BETWEEN 21 AND 30 THEN '21-30'
                WHEN S.OverID BETWEEN 31 AND 40 THEN '31-40'
                WHEN S.OverID BETWEEN 41 AND 50 THEN '41-50'
            END

        WHEN MT.MatchTypeID IN (
            3, 6, 10, 13, 16, 19, 22, 28,
            31, 34, 39, 40, 45, 53, 54
        )
        THEN
            CASE
                WHEN S.OverID BETWEEN 1 AND 6 THEN '01-06'
                WHEN S.OverID BETWEEN 7 AND 10 THEN '07-10'
                WHEN S.OverID BETWEEN 11 AND 15 THEN '11-15'
                WHEN S.OverID BETWEEN 16 AND 20 THEN '16-20'
            END
    END AS PhaseofPlay,

    NULLIF(PNSP.WKT, 0) AS PartnerWktOrder,

    CASE
        WHEN ',' || S.Batsman || ',' LIKE '%,5,%' THEN 1
        ELSE 0
    END AS Uncomfortable,

    IFNULL(P.Penalty, 0) AS Penalty1,

    AT.LengthX AS PM_X_CM_Hauk,
    AT.LengthY AS PM_Y_CM_Hauk,
    AT.HeightX AS SZ_X_CM_Batter,
    AT.HeightY AS SZ_Y_CM_Batter,
    AT.StumpHeightX AS SZ_X_CM_Stump,
    AT.StumpHeightY AS SZ_Y_CM_Stump,
    AT.CreaseHeightX AS SZ_X_CM_crease,
    AT.CreaseHeightY AS SZ_Y_CM_Crease,
    AT.RPX AS RPX_H,
    AT.RPY AS RPY_H,
    AT.Swing AS Swing_H,
    AT.Deviation AS Deviation_H,
    AT.ReactionTime_to_Crease AS ReactionTime_to_Crease_H,
    AT.ReactionTime_to_interception AS ReactionTime_to_interception_H,
    AT.IPX_CM AS IPX_CM_H,

    ABS(
        ROUND(405 - ((NULLIF(AT.HeightY, -99990) * 90) / 71), 0)
    ) AS IPY_CM_H,

    AT.ReleaseSpeed AS ReleaseSpeed,
    AT.StumpHeightY AS BounsHeight,
    AT.DIP AS Dip,

    CASE
        WHEN S.BatSubject = 5
          OR S.BatSubject LIKE '%5%'
          OR S.ShotConnection IN (1, 2, 3, 4, 5, 11, 12)
        THEN 1
        ELSE 0
    END AS FS

FROM Scorecard S

LEFT JOIN Players ST
    ON ST.PlayerID = S.StrikerID

LEFT JOIN Players NST
    ON NST.PlayerID = S.NonStrikerID

LEFT JOIN Players BR
    ON BR.PlayerID = S.BowlerID

LEFT JOIN Players DF
    ON DF.PlayerID = S.DismissalFielderID1

LEFT JOIN Players DF2
    ON DF2.PlayerID = S.DismissalFielderID2

LEFT JOIN Players F
    ON F.PlayerID = S.FielderID

LEFT JOIN Players DB
    ON DB.PlayerID = S.DismissedBatter

LEFT JOIN Players NBD
    ON NBD.PlayerID = S.NonBall_dismissBatter

LEFT JOIN BowlingStyle BS
    ON BS.Id = S.DeliveryStyle

LEFT JOIN Stroke SK
    ON SK.ID = S.StrokeType

LEFT JOIN DismissalType DT
    ON DT.ID = S.DismissalTypeID

LEFT JOIN CreaseMovement CMT
    ON CMT.Id = S.CreaseMovement

LEFT JOIN BatSubjectMaster BSM
    ON BSM.Id = S.BatSubject

LEFT JOIN BattingOrder BO
    ON BO.MatchID = S.MatchID
   AND BO.InningsID = S.InningsID
   AND BO.PlayerID = S.StrikerID

JOIN Match MT
    ON MT.ID = S.MatchID

LEFT JOIN Stadium STD
    ON STD.ID = MT.StadiumID

JOIN Innings I
    ON I.InningsID = S.InningsID
   AND I.MatchID = S.MatchID

LEFT JOIN Penalty P
    ON P.InningsID = S.InningsID
   AND P.MatchID = S.MatchID
   AND P.Overs = S.Overs

LEFT JOIN MultipleBowlersCTE TB
    ON TB.MatchID = S.MatchID
   AND TB.InningsID = S.InningsID
   AND TB.OverID = S.OverID

LEFT JOIN PartnershipCTE PNSP
    ON PNSP.MatchID = S.MatchID
   AND PNSP.InningsID = S.InningsID
   AND S.BallID BETWEEN
       COALESCE(PNSP.StartBallID, 0)
       AND COALESCE(PNSP.EndBallID, 0)

LEFT JOIN MaidenCTE MC
    ON MC.MatchID = S.MatchID
   AND MC.InningsID = S.InningsID
   AND MC.OverID = S.OverID

LEFT JOIN AdvanceTracking AT
    ON AT.MatchID = S.MatchID
   AND AT.BallID = S.BallID
   AND AT.InningsID = S.InningsID

WHERE S.MatchID = ?

ORDER BY
    S.InningsID ASC,
    S.OverID,
    S.Overs,
    S.BallID ASC;
`;

router.get("/:matchid", async (req, res) => {
    try {
        const matchId = req.params.matchid;

        const params = [
            matchId, // LastBall
            matchId, // RankedPartnership
            matchId, // MaidenCTE
            matchId, // MultipleBowlersCTE
            matchId  // Main query
        ];

        const start = performance.now();

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error("Ball-by-ball query failed:", err);

                return res.status(500).json({
                    status: 500,
                    message: "Error Fetching BallByBall"
                });
            }

            console.log({
                matchId,
                records: rows.length,
                queryExecutionMs: Math.round(
                    performance.now() - start
                )
            });

            return res.status(200).json({
                status: 200,
                data: rows
            });
        });

    } catch (err) {
        console.error("Ball-by-ball API failed:", err);

        return res.status(500).json({
            status: 500,
            message: "Error Fetching BallByBall"
        });
    }
});

const query2 = `WITH LastBall AS (

    SELECT 
        MAX(CASE WHEN Sc.Inningsid = 1 THEN SC.BallID END) Firstinnlastball,
        MAX(CASE WHEN Sc.Inningsid = 2 THEN SC.BallID END) Secondinnlastball 
    FROM Scorecard SC 
    WHERE SC.MatchID = ?
      AND SC.InningsID = ?
      AND SC.BallID = ?

        ),

        PartnershipCTE AS (

            SELECT 
                A.MatchID,
                A.InningsID,
                NULLIF(A.PartnerId,B.PartnerId) AS PartnerId,
                NULLIF(A.Wkt,B.Wkt) AS Wkt,
                NULLIF(B.Overs,0) AS StartOver,
                Coalesce(Cast(B.BallID AS int)+1,0) AS StartBallID,
                A.Overs AS [EndOver],
                A.BallID AS [EndBallID]

            FROM (

                SELECT 
                    MatchID,
                    InningsID,
                    DENSE_RANK() OVER(
                        Partition BY InningsID 
                        ORDER BY Overs,S.BallID
                    ) Wkt,
                    BallID,
                    Overs,
                    DismissalTypeID,

                    CASE 
                        WHEN NonStrikerID > StrikerID 
                        THEN StrikerID || '-' || NonStrikerID 
                        ELSE NonStrikerID || '-' || StrikerID 
                    END AS PartnerId

                FROM Scorecard S 

                WHERE S.MatchID = ?
                AND S.InningsID = ?
                AND S.BallID = ?

                AND (
                        S.DismissalTypeID NOT IN(7,8,14) 
                        OR S.NonBallType IN (9,11) 
                        OR (
                            S.InningsID = 1 
                            AND BallID IN(
                                SELECT Firstinnlastball 
                                FROM LastBall
                            )
                        )
                        OR (
                            S.InningsID = 2 
                            AND BallID IN(
                                SELECT Secondinnlastball 
                                FROM LastBall
                            )
                        )
                )

            ) A 

            LEFT JOIN (

                SELECT 
                    MatchID,
                    InningsID,
                    DENSE_RANK() OVER(
                        Partition BY InningsID 
                        ORDER BY Overs,S.BallID
                    ) Wkt,
                    BallID,
                    Overs,
                    DismissalTypeID,

                    CASE 
                        WHEN NonStrikerID > StrikerID 
                        THEN StrikerID || '-' || NonStrikerID 
                        ELSE NonStrikerID || '-' || StrikerID 
                    END AS PartnerId

                FROM Scorecard S 

                WHERE S.MatchID = ?
                AND S.InningsID = ?
                AND S.BallID = ?

                AND (
                        S.DismissalTypeID NOT IN(7,8,14) 
                        OR S.NonBallType IN (9,11) 
                        OR (
                            S.InningsID = 1 
                            AND BallID IN(
                                SELECT Firstinnlastball 
                                FROM LastBall
                            )
                        )
                        OR (
                            S.InningsID = 2 
                            AND BallID IN(
                                SELECT Secondinnlastball 
                                FROM LastBall
                            )
                        )
                )

            ) B 

            ON A.MatchID = B.MatchID 
            AND A.InningsID = B.InningsID 
            AND A.Wkt = B.Wkt + 1

        )

        SELECT 

            S.*,

            ST.FULLNAME AS StrikerName,
            NST.FULLNAME AS NonStrikerName,
            BR.FULLNAME AS BowlerName,

            I.BattingClubID,
            I.BowlingClubID,

            DF.FULLNAME AS DismissalFielder1Name,

            DF2.FullName AS DismissalFielder2Name,

            SUM(
                S.RUNS 
                + S.EXTRAS 
                + IFNULL(p.Penalty, 0) 
                + S.BLExtras
            ) OVER(
                PARTITION BY S.MATCHID,S.INNINGSID 
                ORDER BY s.OVERS,S.BALLID
            ) AS TeamRuns,

            SUM(S.Dismissal) OVER(
                PARTITION BY S.MATCHID,S.INNINGSID 
                ORDER BY s.OVERS,S.BALLID
            ) AS TeamWickets,

            S.RUNS 
            + CASE 
                WHEN EXTRATYPEID IN (1,2,5) 
                THEN S.EXTRAS 
                ELSE 0 
            END AS Bowlruns,

            CASE 
                WHEN EXTRATYPEID NOT IN (1,2,5) 
                THEN 1 
                ELSE 0 
            END Bowlballs,

            CASE 
                WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) 
                THEN 1 
                ELSE 0 
            END Bowlwkts,

            CASE 
                WHEN S.EXTRATYPEID NOT IN(2) 
                THEN 1 
                ELSE 0 
            END AS Batballs,

            S.RUNS Batruns,

            DB.FullName AS DismissedBatterName,

            F.FullName AS FielderName,

            CASE 
                WHEN DISMISSALTYPEID NOT IN (4,7,8,14,10,0) 
                THEN 1 
                ELSE 0 
            END Batwkts,

            (
                SELECT 
                    SUM(
                        CASE 
                            WHEN (
                                bowlruns = 0 
                                AND endover = 1 
                                AND (
                                    bowlballs = 7  
                                    OR bowlballs = 6 
                                    OR bowlballs = 5
                                )
                            ) 
                            THEN 1 
                            ELSE 0 
                        END
                    )

                FROM (

                    SELECT 
                        MatchId,
                        InningsId,
                        s.OverId,
                        Max(Endover) Endover,

                        Sum(
                            RUNS 
                            + CASE 
                                WHEN EXTRATYPEID IN (1,2,5) 
                                THEN EXTRAS 
                                ELSE 0 
                            END
                        ) AS BowlRuns,

                        Sum(
                            CASE 
                                WHEN EXTRATYPEID NOT IN (1,2,5) 
                                THEN 1 
                                ELSE 0 
                            END
                        ) Bowlballs

                    FROM Scorecard s 

                    WHERE MATCHID = ?
                    AND InningsID = ?
                    AND BallID = ?

                    Group BY 
                        MatchId,
                        InningsId,
                        s.OverId

                ) V 

                WHERE S.MatchID = V.MatchID 
                AND S.InningsID = V.InningsID 
                AND S.OverID = V.OverID  

                Group BY 
                    MatchId,
                    InningsId,
                    OverId 

            ) AS [Maiden],

            BS.DisplayName AS DeliveryStyleName,

            BS.SpinOrPace,

            SK.DisplayName AS StrokeName,

            DT.Description AS DismissalTypeDesc,

            CASE 
                WHEN S.Nonstrikerid > S.strikerid  
                THEN cast(S.strikerid AS varchar(10))
                    || '-' ||
                    cast(S.Nonstrikerid AS varchar(10)) 

                ELSE cast(S.Nonstrikerid AS varchar(10))
                    || '-' ||
                    cast(S.strikerid AS varchar(10)) 

            END Partnerid,

            cast(
                (179 - PM_X) / 1.494  
                AS int
            ) PM_X_CM,

            cast(
                ROUND(
                    CASE 
                        WHEN PM_Y >= 960 
                        THEN PM_Y

                        ELSE  

                            CASE 
                                WHEN (
                                    (
                                        -0.8073 
                                        + SQRT(
                                            (0.65173329) 
                                            - 4 * 0.0000991 * (97.5874 - PM_Y)
                                        )
                                    ) 
                                    / (2 * 0.0000991)
                                ) < 450

                                THEN (
                                    (
                                        -0.8073 
                                        + SQRT(
                                            (0.65173329) 
                                            - 4 * 0.0000991 * (97.5874 - PM_Y)
                                        )
                                    ) 
                                    / (2 * 0.0000991)
                                ) - 7

                                ELSE (
                                    -0.8073 
                                    + SQRT(
                                        (0.65173329) 
                                        - 4 * 0.0000991 * (97.5874 - PM_Y)
                                    )
                                ) 
                                / (2 * 0.0000991)

                            END

                    END,
                    1
                ) AS int
            ) AS PM_Y_CM,

            ABS(
                180 - (
                    (2 * 3.14159265359) 
                    - ATAN2(
                        (WagonWheelX - 300),
                        (WagonWheelY - 259)
                    )
                ) 
                * (180 / 3.14159265359)
            ) AS WW_Angle,

            ROUND(
                SQRT(
                    (S.WagonWheelX - 300) * (S.WagonWheelX - 300) 
                    + (S.WagonWheelY - 300) * (S.WagonWheelY - 300)
                ),
                0
            ) AS WW_Distance,

            ROUND(
                (
                    SQRT(
                        (S.WagonWheelX - 300) * (S.WagonWheelX - 300) 
                        + (S.WagonWheelY - 300) * (S.WagonWheelY - 300)
                    ) 
                    / 258
                ) * 100,
                2
            ) AS WW_DistancePercentage,

            cast(
                Round(
                    (305 - SZ_X) / 1.35,
                    0
                ) AS int
            ) AS SZ_X_CM,

            cast(
                ROUND(
                    ((405 - SZ_Y) * 71) / 90,
                    0
                ) AS int
            ) AS SZ_Y_CM,

            ST.BattingTypeID AS StBattingTypeID,

            BR.BowlingTypeID AS BwBowlingTypeID,

            CMT.DisplayName AS CreaseMovementName,

            BSM.Description AS BatSubjectName,

            ST.BattingTypeID AS BatTypeID,

            I.VideoMode AS InVideoMode,

            I.VideoPath AS InVideoPath,

            BO.BattingOrder AS BatOrder,

            NBD.FullName AS NonBallDismissalBatter,

            CASE 
                WHEN TB.Over = S.Overid 
                THEN true 
                ELSE false 
            END AS MultipleBowlers,

            CASE 

                WHEN MT.MatchTypeID IN (2,5,9,12,15,18,21,36) THEN

                    CASE

                        WHEN S.OverID >= 1 
                        AND S.OverID <= 10 
                        THEN '01-10'

                        WHEN S.OverID >= 11 
                        AND S.OverID <= 20 
                        THEN '11-20'

                        WHEN S.OverID >= 21 
                        AND S.OverID <= 30 
                        THEN '21-30'

                        WHEN S.OverID >= 31 
                        AND S.OverID <= 40 
                        THEN '31-40'

                        WHEN S.OverID >= 41 
                        AND S.OverID <= 50 
                        THEN '41-50'

                    END

                WHEN MT.MatchTypeID IN (
                    3,6,10,13,16,19,22,28,31,
                    34,39,40,45,53,54
                ) THEN

                    CASE

                        WHEN S.OverID >= 1 
                        AND S.OverID <= 6 
                        THEN '01-06'

                        WHEN S.OverID >= 7 
                        AND S.OverID <= 10 
                        THEN '07-10'

                        WHEN S.OverID >= 11 
                        AND S.OverID <= 15 
                        THEN '11-15'

                        WHEN S.OverID >= 16 
                        AND S.OverID <= 20 
                        THEN '16-20'

                    END

            END AS PhaseofPlay,

            NULLIF(PNSp.WKT,0) AS PartnerWktOrder,

            CASE 
                WHEN ',' || S.Batsman || ',' LIKE '%,5,%' 
                THEN 1 
                ELSE 0 
            END AS Uncomfortable,

            ifnull(p.Penalty,0) AS Penalty1,

            AT.LengthX AS PM_X_CM_Hauk,

            AT.LengthY AS PM_Y_CM_Hauk,

            AT.HeightX AS SZ_X_CM_Batter,

            AT.HeightY AS SZ_Y_CM_Batter,

            AT.StumpHeightX AS SZ_X_CM_Stump,

            AT.StumpHeightY AS SZ_Y_CM_Stump,

            AT.CreaseHeightX AS SZ_X_CM_crease,

            AT.CreaseHeightY AS SZ_Y_CM_Crease,

            AT.RPX AS RPX_H,

            AT.RPY AS RPY_H,

            AT.Swing AS Swing_H,

            AT.Deviation AS Deviation_H,

            AT.ReactionTime_to_Crease AS ReactionTime_to_Crease_H,

            AT.ReactionTime_to_interception AS ReactionTime_to_interception_H,

            AT.IPX_CM AS IPX_CM_H,

            ABS(
                ROUND(
                    405 - (
                        (NULLIF(AT.HeightY,-99990) * 90) / 71
                    ),
                    0
                )
            ) AS IPY_CM_H,

            AT.ReleaseSpeed AS ReleaseSpeed,

            AT.StumpHeightY AS BounsHeight,

            AT.DIP AS Dip,

            CASE 
                WHEN S.BatSubject = 5 
                OR S.BatSubject LIKE '%5%' 
                OR S.ShotConnection IN (1,2,3,4,5,11,12)  
                THEN 1 
                ELSE 0 
            END AS [FS]

        FROM SCORECARD S

        LEFT JOIN PLAYERS ST 
            ON ST.PLAYERID = S.STRIKERID

        LEFT JOIN PLAYERS NST 
            ON NST.PLAYERID = S.NONSTRIKERID

        LEFT JOIN PLAYERS BR 
            ON BR.PLAYERID = S.BOWLERID

        LEFT JOIN PLAYERS DF 
            ON DF.PLAYERID = S.DISMISSALFIELDERID1

        LEFT JOIN PLAYERS DF2 
            ON DF.PLAYERID = S.DISMISSALFIELDERID2

        LEFT JOIN PLAYERS F 
            ON F.PLAYERID = S.FielderID

        LEFT JOIN PLAYERS DB 
            ON DB.PlayerID = S.DismissedBatter

        LEFT JOIN PLAYERS NBD 
            ON NBD.PlayerID = S.NonBall_dismissBatter

        LEFT JOIN BOWLINGSTYLE BS 
            ON BS.Id = S.DeliveryStyle

        LEFT JOIN STROKE SK 
            ON SK.ID = S.STROKETYPE

        LEFT JOIN DISMISSALTYPE DT 
            ON DT.ID = S.DismissalTypeID

        LEFT JOIN CREASEMOVEMENT CMT 
            ON CMT.Id = S.CreaseMovement

        LEFT JOIN BATSUBJECTMASTER BSM 
            ON BSM.Id = S.BatSubject

        LEFT JOIN BATTINGORDER BO 
            ON BO.MatchID = S.MatchId 
            AND BO.InningsID = S.InningsId 
            AND BO.PlayerID = S.StrikerID

        JOIN MATCH MT 
            ON MT.ID = S.MATCHID

        LEFT JOIN STADIUM STD 
            ON STD.ID = MT.StadiumID

        JOIN INNINGS I 
            ON I.INNINGSID = S.INNINGSID 
            AND I.MATCHID = S.MATCHID

        LEFT JOIN Penalty p 
            ON p.INNINGSID = S.INNINGSID 
            AND p.MATCHID = S.MATCHID 
            AND p.overs = s.Overs

        LEFT JOIN (

            SELECT 
                MatchId,
                Inningsid,
                s.Overid Over 

            FROM SCorecard s 

            WHERE MatchId = ?
            AND InningsID = ?
            AND BallID = ?

            Group BY 
                MatchId,
                Inningsid,
                Overid 

            HAVING Count(distinct Bowlerid) > 1

        ) TB 

            ON TB.Matchid = S.MatchId 
            AND S.Inningsid = TB.Inningsid 
            AND S.Overid = TB.Over

        LEFT JOIN PartnershipCTE PNSP 
            ON PNSP.Matchid = S.MatchId 
            AND PNSP.InningsID = S.InningsID 
            AND S.BallID BETWEEN Coalesce(PNSP.StartBallID,0) 
                            AND Coalesce(PNSP.EndBallID,0)

        LEFT JOIN Advancetracking AT 
            ON AT.MatchID = S.MatchId 
            AND AT.BallID = S.BALLID 
            AND AT.InningsID = S.INNINGSID 

        WHERE S.MATCHID = ?
        AND S.INNINGSID = ?
        AND S.BALLID = ?

        ORDER BY 
            S.INNINGSID ASC,
            S.OverId,
            S.Overs,
            S.BALLID ASC;`

router.get('/:matchid/:inningsid/:ballid', async (req, res) => {
    try {

        const matchId = req.params.matchid;
        const inningsId = req.params.inningsid;
        const ballId = req.params.ballid;

        const params = [
            // LastBall CTE
            matchId, inningsId, ballId,

            // PartnershipCTE - A
            matchId, inningsId, ballId,

            // PartnershipCTE - B
            matchId, inningsId, ballId,

            // Maiden subquery
            matchId, inningsId, ballId,

            // TB subquery
            matchId, inningsId, ballId,

            // Final WHERE
            matchId, inningsId, ballId
        ];

        let debugQuery = query2;

        params.forEach(param => {
            debugQuery = debugQuery.replace('?', `'${param}'`);
        });

        // console.log("Final Debug Query:",debugQuery);


        const result = await new Promise((resolve, reject) => {

            db.all(query2, params, (err, rows) => {

                if (err) {
                    return reject(err);
                }

                resolve(rows);
            });

        });

        res.status(200).send({
            status: 200,
            data: result
        });

    } catch (err) {

        // console.error("Error Fetching BallByBall:", err);

        res.status(500).send({
            status: 500,
            message: "Error Fetching BallByBall",
            error: err.message
        });
    }
});


const query3 = `
    SELECT *
    FROM ScorcardLogs
    WHERE MatchId = ?
      AND LastUpdated > ?
`;

router.get('/getScorecarlogs/:matchid', async (req, res) => {

    try {

        const { matchid } = req.params;
        const { lastupdated } = req.query;

        const result = await new Promise((resolve, reject) => {

            db.all(
                query3,
                [matchid, lastupdated],
                (err, rows) => {

                    if (err) {
                        return reject(err);
                    }

                    resolve(rows);
                }
            );

        });

        res.status(200).send({
            status: 200,
            data: result
        });

    } catch (err) {

        // console.error("Error Fetching ScoreCard_Logs:", err);

        res.status(500).send({
            status: 500,
            message: "Error Fetching ScoreCard_Logs"
        });
    }

});

export default router;
