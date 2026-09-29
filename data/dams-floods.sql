-- The major and the 1000-year flood move out of CLASS_FLOOD into classes of their own (data/dams-floods.xml), so a
-- Dam can hold back some floods and not others. Everything else that names CLASS_FLOOD is widened to the new classes
-- too, so the split changes nothing but the Dams: the Khmer Baray, the Water Puppet Theater, the Ho'okupu tradition
-- and any other mod's flood immunity still cover all three floods, a bridge the floods pillage is still pillaged by
-- all three, and the flood tooltips and icons still show.

UPDATE RandomEvents SET EventClass = 'CLASS_DAMS_FLOOD_MAJOR' WHERE RandomEventType = 'RANDOM_EVENT_FLOOD_MAJOR';
UPDATE RandomEvents SET EventClass = 'CLASS_DAMS_FLOOD_1000_YEAR' WHERE RandomEventType = 'RANDOM_EVENT_FLOOD_1000_YEAR';

INSERT OR IGNORE INTO RandomEventUI (EventClass, AlertTooltip, Tooltip)
SELECT 'CLASS_DAMS_FLOOD_MAJOR', AlertTooltip, Tooltip FROM RandomEventUI WHERE EventClass = 'CLASS_FLOOD';
INSERT OR IGNORE INTO RandomEventUI (EventClass, AlertTooltip, Tooltip)
SELECT 'CLASS_DAMS_FLOOD_1000_YEAR', AlertTooltip, Tooltip FROM RandomEventUI WHERE EventClass = 'CLASS_FLOOD';

-- Buildings the floods pillage or spare (the Ancient Bridge at 100, the Modern Bridge at 0).
INSERT OR IGNORE INTO Constructible_PillageRandomEvents (ConstructibleType, EventClass, PercentChance)
SELECT ConstructibleType, 'CLASS_DAMS_FLOOD_MAJOR', PercentChance FROM Constructible_PillageRandomEvents
WHERE EventClass = 'CLASS_FLOOD';
INSERT OR IGNORE INTO Constructible_PillageRandomEvents (ConstructibleType, EventClass, PercentChance)
SELECT ConstructibleType, 'CLASS_DAMS_FLOOD_1000_YEAR', PercentChance FROM Constructible_PillageRandomEvents
WHERE EventClass = 'CLASS_FLOOD';

CREATE TRIGGER IF NOT EXISTS DAMS_FLOOD_PILLAGE_ROWS
AFTER INSERT ON Constructible_PillageRandomEvents
FOR EACH ROW
WHEN NEW.EventClass = 'CLASS_FLOOD'
BEGIN
    INSERT OR IGNORE INTO Constructible_PillageRandomEvents (ConstructibleType, EventClass, PercentChance)
    VALUES (NEW.ConstructibleType, 'CLASS_DAMS_FLOOD_MAJOR', NEW.PercentChance),
           (NEW.ConstructibleType, 'CLASS_DAMS_FLOOD_1000_YEAR', NEW.PercentChance);
END;

-- Flood immunity from anything but the Dams: a RandomEventClass argument listing CLASS_FLOOD (alone or in a comma
-- list, as the Ho'okupu tradition writes it) gains the two new classes. The Dams' own modifiers are left alone; each
-- names exactly the floods its age holds back (data/dams-effects.xml).
UPDATE ModifierArguments
SET Value = Value || ', CLASS_DAMS_FLOOD_MAJOR, CLASS_DAMS_FLOOD_1000_YEAR'
WHERE Name = 'RandomEventClass'
  AND ModifierId NOT LIKE 'MOD_DAMS_%'
  AND ',' || REPLACE(Value, ' ', '') || ',' LIKE '%,CLASS_FLOOD,%'
  AND Value NOT LIKE '%CLASS_DAMS_FLOOD_MAJOR%';

CREATE TRIGGER IF NOT EXISTS DAMS_FLOOD_IMMUNITY_ARGS
AFTER INSERT ON ModifierArguments
FOR EACH ROW
WHEN NEW.Name = 'RandomEventClass'
  AND NEW.ModifierId NOT LIKE 'MOD_DAMS_%'
  AND ',' || REPLACE(NEW.Value, ' ', '') || ',' LIKE '%,CLASS_FLOOD,%'
  AND NEW.Value NOT LIKE '%CLASS_DAMS_FLOOD_MAJOR%'
BEGIN
    UPDATE ModifierArguments
    SET Value = NEW.Value || ', CLASS_DAMS_FLOOD_MAJOR, CLASS_DAMS_FLOOD_1000_YEAR'
    WHERE ModifierId = NEW.ModifierId AND Name = NEW.Name;
END;
