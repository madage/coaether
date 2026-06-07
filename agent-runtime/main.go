package main

import "log"

func main() {
	log.SetFlags(log.Ltime | log.Lshortfile)
	if err := rootCmd.Execute(); err != nil {
		log.Fatal(err)
	}
}
