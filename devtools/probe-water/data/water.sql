INSERT OR IGNORE INTO Adjacency_YieldChanges (ID, YieldType, YieldChange, AdjacentLake)
VALUES ('DamProbeLakeFood', 'YIELD_FOOD', 1, 1);
INSERT OR IGNORE INTO Adjacency_YieldChanges (ID, YieldType, YieldChange, AdjacentTerrain)
VALUES ('DamProbeNavigableProduction', 'YIELD_PRODUCTION', 1, 'TERRAIN_NAVIGABLE_RIVER');
INSERT OR IGNORE INTO Constructible_Adjacencies (ConstructibleType, YieldChangeId)
SELECT ConstructibleType, 'DamProbeLakeFood' FROM Constructibles
WHERE ConstructibleType IN ('BUILDING_DAM_ANTIQUITY', 'BUILDING_DAM_EXPLORATION', 'BUILDING_DAM_MODERN');
INSERT OR IGNORE INTO Constructible_Adjacencies (ConstructibleType, YieldChangeId)
SELECT ConstructibleType, 'DamProbeNavigableProduction' FROM Constructibles
WHERE ConstructibleType IN ('BUILDING_DAM_ANTIQUITY', 'BUILDING_DAM_EXPLORATION', 'BUILDING_DAM_MODERN');
