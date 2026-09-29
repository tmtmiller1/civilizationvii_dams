-- A Dam goes on any river tile of the settlement, and a Levee in the settlement's own centre. Neither has a placement
-- adjacency. Some compact-city mods set AdjacentDistrict = 'DISTRICT_CITY_CENTER' on every building from a very late
-- LoadOrder: that would keep Dams beside the centre and leave no tile a Levee can take (a centre is not beside
-- itself). This trigger runs whenever a later update writes the column on a Dams building and clears it again, so it
-- holds whatever LoadOrder the other mod uses.

CREATE TRIGGER IF NOT EXISTS DAMS_KEEP_RIVER_PLACEMENT
AFTER UPDATE OF AdjacentDistrict ON Constructibles
FOR EACH ROW
WHEN NEW.AdjacentDistrict IS NOT NULL
  AND NEW.ConstructibleType IN
      ('BUILDING_DAM_ANTIQUITY', 'BUILDING_DAM_EXPLORATION', 'BUILDING_DAM_MODERN', 'BUILDING_DAM_LEVEE')
BEGIN
    UPDATE Constructibles SET AdjacentDistrict = NULL WHERE ConstructibleType = NEW.ConstructibleType;
END;
