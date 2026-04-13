-- Fix: Ajouter la valeur par défaut à la colonne nbJours si elle n'existe pas
-- Cette migration corrige le drift détecté après modification de la migration précédente

-- Vérifier et mettre à jour les valeurs NULL
UPDATE `offers` SET `nbJours` = 7 WHERE `nbJours` IS NULL;

-- Modifier la colonne pour ajouter la valeur par défaut
ALTER TABLE `offers` MODIFY COLUMN `nbJours` INTEGER NOT NULL DEFAULT 7;

