use rand::Rng;
use crate::models::{Character, Grade};

/// 등급 추첨
/// UR 3% / SSR 17% / RARE 35% / COMMON 45%
pub fn roll_grade(rng: &mut impl Rng) -> Grade {
    let roll: f64 = rng.gen_range(0.0..100.0);
    if      roll < 3.0  { Grade::Ur }
    else if roll < 20.0 { Grade::Ssr }
    else if roll < 55.0 { Grade::Rare }
    else                { Grade::Common }
}

/// 해당 등급에서 랜덤 캐릭터 선택
pub fn pick_character<'a>(
    pool:  &'a [Character],
    grade: Grade,
    rng:   &mut impl Rng,
) -> &'a Character {
    let filtered: Vec<&Character> = pool.iter().filter(|c| c.grade == grade).collect();
    let candidates = if filtered.is_empty() { pool.iter().collect::<Vec<_>>() } else { filtered };
    candidates[rng.gen_range(0..candidates.len())]
}

/// times 회 뽑기 결과를 반환합니다.
pub fn draw(pool: &[Character], times: usize) -> Vec<Character> {
    let mut rng = rand::thread_rng();
    (0..times)
        .map(|_| {
            let grade = roll_grade(&mut rng);
            pick_character(pool, grade, &mut rng).clone()
        })
        .collect()
}