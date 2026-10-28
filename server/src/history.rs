//! The last minutes of CPU load, kept by the engine so "who turned the fans on?" can also
//! answer for the time before the arena tab was opened.

use std::collections::VecDeque;

use serde::Serialize;
use ts_rs::TS;

use crate::apps::App;

/// Ten minutes at one sample a second.
const CAPACITY: usize = 600;
/// Busiest apps kept per sample: enough to name the culprits of a spike.
const TOP: usize = 3;
/// Below this an app is idle and not worth naming.
const BUSY_CPU: f32 = 1.0;

/// One second of CPU load as the engine keeps it: total share of all cores, and the busiest apps.
#[derive(Serialize, TS)]
#[ts(export, rename = "CpuSample")]
struct Sample {
    /// Unix seconds.
    t: u64,
    /// Share of all cores in use, 0–100.
    cpu: f32,
    /// The busiest apps as [id, name, cpu], with cpu in per-core percent (100 = one core).
    top: Vec<(String, String, f32)>,
}

/// What `/api/history` answers.
#[derive(Serialize, TS)]
#[ts(export, rename = "CpuHistory")]
struct Payload<'a> {
    cores: usize,
    #[ts(as = "Vec<Sample>")]
    samples: &'a VecDeque<Sample>,
}

pub struct History {
    cores: usize,
    samples: VecDeque<Sample>,
}

fn tenth(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}

impl History {
    pub fn new() -> Self {
        Self {
            cores: std::thread::available_parallelism().map_or(1, usize::from),
            samples: VecDeque::with_capacity(CAPACITY),
        }
    }

    pub fn record(&mut self, t: u64, apps: &[App]) {
        let total: f32 = apps.iter().map(|app| app.cpu).sum();
        let mut busy: Vec<&App> = apps.iter().filter(|app| app.cpu >= BUSY_CPU).collect();
        busy.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
        let top = busy
            .into_iter()
            .take(TOP)
            .map(|app| (app.id.clone(), app.name.clone(), tenth(app.cpu)))
            .collect();
        if self.samples.len() == CAPACITY {
            self.samples.pop_front();
        }
        self.samples.push_back(Sample {
            t,
            cpu: tenth((total / self.cores as f32).min(100.0)),
            top,
        });
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(&Payload {
            cores: self.cores,
            samples: &self.samples,
        })
        .unwrap_or_else(|_| "{}".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str, cpu: f32) -> App {
        App {
            id: format!("app:{name}"),
            pid: 1,
            pids: vec![1],
            name: name.into(),
            memory: 0,
            cpu,
            process_count: 1,
            locked: false,
            system: false,
        }
    }

    #[test]
    fn keeps_ten_minutes_and_the_busiest_apps() {
        let mut history = History {
            cores: 4,
            samples: VecDeque::new(),
        };
        for t in 0..(CAPACITY as u64 + 5) {
            history.record(
                t,
                &[app("idle", 0.4), app("Chrome", 180.0), app("vite", 20.0)],
            );
        }
        assert_eq!(history.samples.len(), CAPACITY);
        let last = history.samples.back().unwrap();
        assert_eq!(history.samples.front().unwrap().t, 5);
        assert_eq!(last.cpu, 50.1);
        let names: Vec<&str> = last.top.iter().map(|(_, name, _)| name.as_str()).collect();
        assert_eq!(names, ["Chrome", "vite"]);
    }
}
