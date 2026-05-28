-- zenryoku コースを「全力コース」に統一
UPDATE back_rates SET course_type = '全力コース' WHERE course_type = 'zenryoku';

-- 既存予約の course_type / course_name を統一
UPDATE reservations
SET course_type = '全力コース',
    course_name = '全力コース ' || COALESCE(duration, 60) || '分'
WHERE course_type = 'zenryoku' OR course_name ILIKE '%zenryoku%';
