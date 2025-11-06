# documentation for check Endpoints

-   register

```
    curl.exe -X POST "http://localhost:8000/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"user4@example.com\",\"password\":\"password123\",\"passwordConfirm\":\"password123\",\"name\":\"user four\"}"
```

-   login

```
    curl.exe -X POST "http://localhost:8000/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"user4@example.com\",\"password\":\"password123\"}"

```

-   set Token

```
    set TOKEN=

```

-   me info

```
   curl.exe -X GET "http://localhost:8000/auth/me" -H "Authorization: Bearer %TOKEN%"

```

-   create calendar

```
   curl.exe -X POST "http://localhost:8000/calendars" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"name\":\"Work\",\"color\":\"#3b82f6\",\"description\":\"Team tasks\"}"

```

-   set calendar id

```
  set CAL_ID=

```

-   get categories

```
  curl.exe -X GET "http://localhost:8000/categories" -H "Authorization: Bearer %TOKEN%"

```

-   set category id

```
  set CAT_ID=

```

-   create category

```
curl.exe -X POST "http://localhost:8000/categories" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"title\":\"Work\",\"color\":\"#ff00aa\"}"

```

-   create event

```
curl.exe -X POST "http://localhost:8000/calendars/%CAL_ID%/events" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"title\":\"Sprint planning\",\"description\":\"Zoom link...\",\"start\":\"2025-11-06T09:00:00.000Z\",\"end\":\"2025-11-06T10:00:00.000Z\",\"categoryId\":\"%CAT_ID%\"}"


```

or

```
curl.exe -X POST "http://localhost:8000/calendars/%CAL_ID%/events" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"title\":\"Standup\",\"description\":\"Daily sync\",\"start\":\"2025-11-06T08:00:00.000Z\",\"end\":\"2025-11-06T08:15:00.000Z\",\"categoryId\":\"%CAT_ID%\",\"recurrence\":{\"rrule\":\"FREQ=WEEKLY;BYDAY=TH\"}}"

```

-   set event id

```
set EVENT_ID=

```

-   get event between datas

```
curl.exe -X GET "http://localhost:8000/calendars/%CAL_ID%/events?from=2025-11-01T00:00:00.000Z&to=2025-12-01T00:00:00.000Z&expand=1" -H "Authorization: Bearer %TOKEN%"

```

-   update event

```
curl.exe -X PUT "http://localhost:8000/events/%EVENT_ID%" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"title\":\"Sprint planning (moved)\"}"

```

-   delete event

```
curl.exe -X DELETE "http://localhost:8000/events/%EVENT_ID%" -H "Authorization: Bearer %TOKEN%"


```

-   share event

```
curl.exe -X POST "http://localhost:8000/events/%EVENT_ID%/participants" ^
  -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" ^
  -d "{\"userId\":\"%USER_ID%\"}"
```

-   set shared event in your calendar

```
curl.exe -X POST "http://localhost:8000/events/%EVENT_ID%/placement" ^
  -H "Authorization: Bearer %USER_TOKEN%" -H "Content-Type: application/json" ^
  -d "{\"calendarId\":\"690cee81864035bb2b38b78d\"}"
```

-   see events in calendar with time mark

```
curl.exe -H "Authorization: Bearer %USER_TOKEN%" ^
  "http://localhost:8000/calendars/690cee81864035bb2b38b78d/events?from=2025-11-06T00:00:00.000Z&to=2025-11-07T00:00:00.000Z"

```

-   delete participant of event

```
curl.exe -X DELETE "http://localhost:8000/events/%EVENT_ID%/participants/%USER_ID%" ^
  -H "Authorization: Bearer %TOKEN%"

```
