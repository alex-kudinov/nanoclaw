BEGIN;

UPDATE public.classification_taxonomy
   SET auto_archive = false,
       updated_at = NOW()
 WHERE label IN ('MrGru/internal/team', 'MrGru/notification/calendar');

DELETE FROM public.classification_taxonomy
 WHERE label IN (
   'MrGru/association/event',
   'MrGru/lead/declined',
   'MrGru/lead/hot',
   'MrGru/lead/reply',
   'MrGru/legal/nda',
   'MrGru/meeting-assets/notes',
   'MrGru/notification/monitoring',
   'MrGru/spam',
   'MrGru/student/support'
 );

COMMIT;
