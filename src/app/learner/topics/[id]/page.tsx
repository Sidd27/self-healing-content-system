'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  // selected answer per question index, null = unanswered
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
          setQuiz({
            step: 'lesson',
            questionIndex: 0,
            answers: Array(u.questions.length).fill(null),
          });
        }
        setLoaded(true);
      });
  }, [id]);

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!unit)
    return (
      <p className="text-sm text-muted-foreground">
        No content yet — run the pipeline to generate learning content.
      </p>
    );

  const { questions } = unit;
  const totalQuestions = questions.length;

  if (quiz.step === 'lesson') {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
            Step 1 — Lesson
          </p>
            <h1 className="text-2xl font-semibold">{unit.topicName}</h1>
          <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
            Content verified ·{' '}
            {new Date(unit.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm leading-relaxed">{unit.lesson}</p>
          </CardContent>
        </Card>
        <Button onClick={() => setQuiz((q) => ({ ...q, step: 'quiz', questionIndex: 0 }))}>
          Go to Questions →
        </Button>
      </div>
    );
  }

  const { questionIndex, answers } = quiz;
  const current = questions[questionIndex];
  const selected = answers[questionIndex];
  const isAnswered = selected !== null;
  const isLast = questionIndex === totalQuestions - 1;

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
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Step 2 — Questions
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{unit.topicName}</h1>
          <span className="text-sm text-muted-foreground">
            {questionIndex + 1} / {totalQuestions}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">{current.question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {current.options.map((opt, i) => {
            let variant: 'outline' | 'default' | 'destructive' = 'outline';
            if (isAnswered) {
              if (i === current.correctIndex) variant = 'default';
              else if (i === selected) variant = 'destructive';
            }
            return (
              <button
                key={i}
                onClick={() => selectAnswer(i)}
                disabled={isAnswered}
                className={[
                  'w-full text-left rounded border px-4 py-2 text-sm transition-colors',
                  !isAnswered && 'hover:bg-muted cursor-pointer',
                  isAnswered &&
                    i === current.correctIndex &&
                    'bg-green-50 border-green-500 text-green-800',
                  isAnswered &&
                    i === selected &&
                    i !== current.correctIndex &&
                    'bg-red-50 border-red-400 text-red-800',
                  isAnswered && i !== current.correctIndex && i !== selected && 'opacity-50',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            );
          })}

          {isAnswered && (
            <div className="mt-4 border-l-2 border-muted-foreground/30 pl-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Rationale
              </p>
              <p className="text-sm text-muted-foreground">{current.rationale}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {isAnswered && !isLast && <Button onClick={next}>Next Step →</Button>}
        {isAnswered && isLast && (
          <Button onClick={restart} variant="outline">
            Start Over
          </Button>
        )}
      </div>
    </div>
  );
}
