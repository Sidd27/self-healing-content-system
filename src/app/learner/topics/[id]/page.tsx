'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type LearningUnitRow = {
  learningUnitId: string
  topicId: string
  topicName: string
  versionId: string
  question: string
  rationale: string
  lesson: string
  createdAt: string
}

type Revealed = Record<string, { rationale: boolean; lesson: boolean }>

export default function TopicLearnerPage() {
  const { id } = useParams<{ id: string }>()
  const [units, setUnits] = useState<LearningUnitRow[]>([])
  const [topicName, setTopicName] = useState<string>('')
  const [revealed, setRevealed] = useState<Revealed>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/learning-units?topicId=${id}`)
      .then(r => r.json())
      .then((data: { learningUnits: LearningUnitRow[] }) => {
        setUnits(data.learningUnits)
        if (data.learningUnits.length > 0) {
          setTopicName(data.learningUnits[0].topicName)
        }
        setLoaded(true)
      })
  }, [id])

  // If no units yet, fetch topic name from topics API so we can show it
  useEffect(() => {
    if (loaded && units.length === 0) {
      fetch('/api/topics/all')
        .then(r => r.json())
        .then((entries: { topic: { id: string; name: string }; source: { name: string } }[]) => {
          const match = entries.find(e => e.topic.id === id)
          if (match) setTopicName(match.topic.name)
        })
    }
  }, [loaded, units, id])

  function toggle(unitId: string, field: 'rationale' | 'lesson') {
    setRevealed(r => ({
      ...r,
      [unitId]: {
        ...(r[unitId] ?? { rationale: false, lesson: false }),
        [field]: !r[unitId]?.[field],
      },
    }))
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {topicName && (
        <div>
          <h1 className="text-2xl font-semibold">{topicName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Learning Units</p>
        </div>
      )}
      {!topicName && loaded && (
        <h1 className="text-2xl font-semibold">Learning Units</h1>
      )}

      {units.map(unit => {
        const isRationaleShown = revealed[unit.learningUnitId]?.rationale ?? false
        const isLessonShown = revealed[unit.learningUnitId]?.lesson ?? false
        return (
          <Card key={unit.learningUnitId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{unit.question}</p>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => toggle(unit.learningUnitId, 'rationale')}
                >
                  {isRationaleShown ? 'Hide' : 'Show'} Rationale
                </Button>
                {isRationaleShown && (
                  <p className="text-sm text-muted-foreground border-l-2 pl-3">
                    {unit.rationale}
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => toggle(unit.learningUnitId, 'lesson')}
                >
                  {isLessonShown ? 'Hide' : 'Show'} Lesson
                </Button>
                {isLessonShown && (
                  <p className="text-sm text-muted-foreground border-l-2 pl-3">
                    {unit.lesson}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {loaded && units.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No content yet — run the pipeline to generate learning content.
        </p>
      )}
    </div>
  )
}
