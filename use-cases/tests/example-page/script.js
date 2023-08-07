
const jokeElement = document.getElementById("joke");
const getJokeButton = document.getElementById("getJoke");

getJokeButton.addEventListener("click", fetchJoke);

async function fetchJoke() {
    try {
        const response = await fetch("http://0.0.0.0:8080/jokes/random");
        const data = await response.json();

        jokeElement.textContent = data.setup + " " + data.punchline;
    } catch (error) {
        console.error("Error fetching joke:", error);
        jokeElement.textContent = "Error fetching joke. Please try again later.";
    }
}
