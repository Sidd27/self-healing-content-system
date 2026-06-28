'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { McqQuestion } from '@/db/schema';

type LearningUnit = {
  learningUnitId: string;
  topicName: string;
  lesson: string;
  questions: McqQuestion[];
  createdAt: string;
};

type QuizState = {
  step: 'lesson' | 'quiz';
  questionIndex: number;
  answers: (number | null)[];
};

export default function TopicLearnerPage() {
  const { id } = useParams<{ id: string }>();
  const [unit, setUnit] = useState<LearningUnit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [quiz, setQuiz] = useState<QuizState>({ step: 'lesson', questionIndex: 0, answers: [] });

  useEffect(() => {
    fetch(`/api/learning-units?topicId=${id}`)
      .then((r) => r.json())
      .then((data: { learningUnits: LearningUnit[] }) => {
        if (data.learningUnits.length > 0) {
          const u = data.learningUnits[0];
          setUnit(u);
          setQuiz({ step: 'lesson', questionIndex: 0, answers: Array(u.questions.length).fill(null) });
        }
        setLoaded(true);
      });
  }, [id]);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!unit) return (
    <p className="text-sm text-muted-foreground">
      No content yet — run the pipeline to generate learning content.
    </p>
  );

  const { questions } = unit;
  const totalQuestions = questions.length;

  if (quiz.step === 'lesson') {
    return (
      <div className="space-y-6 max-w-2xl">
        <Link href="/learner" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Topics
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Lesson
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{unit.topicName}</h1>
          <p className="text-xs text-muted-foreground mt-1.5" suppressHydrationWarning>
            Verified ·{' '}
            {new Date(unit.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm leading-7 text-foreground/90">{unit.lesson}</p>
          </CardContent>
        </Card>
        <Button onClick={() => setQuiz((q) => ({ ...q, step: 'quiz', questionIndex: 0 }))}>
          Start quiz →
        </Button>
      </div>
    );
  }

  const { questionIndex, answers } = quiz;
  const current = questions[questionIndex];
  const selected = answers[questionIndex];
  const isAnswered = selected !== null;
  const isLast = questionIndex === totalQuestions - 1;
  const answeredCount = answers.filter((a) => a !== null).length;
  const progressPct = (answeredCount / totalQuestions) * 100;

  function selectAnswer(optionIndex: number) {
    if (isAnswered) return;
    setQuiz((q) => {
      const next = [...q.answers];
      next[questionIndex] = optionIndex;
      return { ...q, answers: next };
    });
  }

  function next() {
    setQuiz((q) => ({ ...q, questionIndex: q.questionIndex + 1 }));
  }

  function restart() {
    setQuiz({ step: 'lesson', questionIndex: 0, answers: Array(totalQuestions).fill(null) });
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/learner" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Topics
      </Link>
      {/* Header + progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Quiz
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{unit.topicName}</h1>
          </div>
          <span className="text-sm tabular-nums text-muted-foreground shrink-0">
            {questionIndex + 1} / {totalQuestions}
          </span>
        </div>
        <Progress value={progressPct} />
      </div>

      {/* Question card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-medium leading-relaxed">{current.question}</p>
          <div className="space-y-2 pt-1">
            {current.options.map((opt, i) => {
              const isCorrect = i === current.correctIndex;
              const isSelected = i === selected;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  disabled={isAnswered}
                  className={cn(
                    'w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-colors flex items-center gap-3',
                    !isAnswered && 'hover:bg-muted/60 cursor-pointer',
                    isAnswered && isCorrect && 'bg-emerald-50 border-emerald-300 text-emerald-800',
                    isAnswered && isSelected && !isCorrect && 'bg-red-50 border-red-300 text-red-800',
                    isAnswered && !isCorrect && !isSelected && 'opacity-40',
                  )}
                >
                  <span className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold border',
                    !isAnswered && 'border-muted-foreground/30 text-muted-foreground',
                    isAnswered && isCorrect && 'border-emerald-500 bg-emerald-500 text-white',
                    isAnswered && isSelected && !isCorrect && 'border-red-400 bg-red-400 text-white',
                    isAnswered && !isCorrect && !isSelected && 'border-muted-foreground/20',
                  )}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="mt-4 rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Rationale
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{current.rationale}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {isAnswered && !isLast && <Button onClick={next}>Next →</Button>}
        {isAnswered && isLast && (
          <>
            <Button variant="outline" onClick={restart}>Back to lesson</Button>
          </>
        )}
      </div>
    </div>
  );
}
